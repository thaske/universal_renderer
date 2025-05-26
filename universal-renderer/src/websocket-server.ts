import type {
  WebSocketConnection,
  WebSocketMessage,
  WebSocketServerOptions,
} from "./websocket-types";

const uWS = require("uWebSockets.js");

/**
 * WebSocket instance with connection data for uWebSockets
 */
interface UWSWebSocket {
  send: (message: string, isBinary?: boolean, compress?: boolean) => boolean;
  close: () => void;
  getRemoteAddressAsText: () => ArrayBuffer;
  connectionData?: WebSocketConnection<any>;
}

/**
 * Creates a WebSocket server for Server-Side Rendering using uWebSockets.
 *
 * This replaces the Express-based HTTP server with a high-performance WebSocket server
 * that maintains the same rendering capabilities while enabling real-time bidirectional
 * communication between the Ruby gem and the Node.js service.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for the WebSocket SSR server
 * @returns Promise that resolves to a uWebSockets server instance
 *
 * @example
 * ```typescript
 * import { createWebSocketServer } from 'universal-renderer';
 *
 * const server = await createWebSocketServer({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   render: async (context) => ({ body: renderToString(<App {...context} />) }),
 *   cleanup: (context) => context.store?.dispose(),
 *   port: 3000
 * });
 * ```
 */
export async function createWebSocketServer<
  TContext extends Record<string, any> = Record<string, any>,
>(options: WebSocketServerOptions<TContext>) {
  if (!options.render) {
    throw new Error("render callback is required");
  }

  const connections = new Map<string, WebSocketConnection<TContext>>();
  const wsConnections = new Map<string, UWSWebSocket>();
  const pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  function handleMessage(ws: UWSWebSocket, message: string | Buffer) {
    try {
      const data: WebSocketMessage = JSON.parse(
        Buffer.from(message).toString(),
      );
      const connection = ws.connectionData;

      switch (data.type) {
        case "ssr_request":
          handleSSRRequest(ws, data);
          break;
        case "stream_request":
          handleStreamRequest(ws, data);
          break;
        case "health_check":
          handleHealthCheck(ws, data);
          break;
        case "ssr_response":
        case "stream_chunk":
        case "stream_end":
        case "error":
          handleResponse(data);
          break;
        default:
          console.warn(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
      ws.send(
        JSON.stringify({
          id: "unknown",
          type: "error",
          payload: { message: "Invalid message format", code: "PARSE_ERROR" },
        }),
      );
    }
  }

  async function handleSSRRequest(ws: UWSWebSocket, data: WebSocketMessage) {
    let context: TContext | undefined;

    try {
      const { url, props = {} } = data.payload;

      if (!url) {
        ws.send(
          JSON.stringify({
            id: data.id,
            type: "error",
            payload: { message: "URL is required", code: "MISSING_URL" },
          }),
        );
        return;
      }

      // Set up the rendering context
      context = (await options.setup?.(url, props)) || ({} as TContext);

      // Render the application
      const result = await options.render(context);

      // Send the response
      ws.send(
        JSON.stringify({
          id: data.id,
          type: "ssr_response",
          payload: result,
        }),
      );
    } catch (error) {
      console.error("[WebSocket SSR] Render error:", error);
      ws.send(
        JSON.stringify({
          id: data.id,
          type: "error",
          payload: { message: "Internal Server Error", code: "RENDER_ERROR" },
        }),
      );
    } finally {
      // Always clean up resources
      if (context && options.cleanup) {
        options.cleanup(context);
      }
    }
  }

  async function handleStreamRequest(ws: UWSWebSocket, data: WebSocketMessage) {
    let context: TContext | undefined;

    try {
      const { url, props = {}, template } = data.payload;

      if (!url) {
        ws.send(
          JSON.stringify({
            id: data.id,
            type: "error",
            payload: { message: "URL is required", code: "MISSING_URL" },
          }),
        );
        return;
      }

      if (!options.streamCallbacks) {
        ws.send(
          JSON.stringify({
            id: data.id,
            type: "error",
            payload: {
              message: "Streaming not configured",
              code: "STREAMING_DISABLED",
            },
          }),
        );
        return;
      }

      // Set up the rendering context
      context = (await options.setup?.(url, props)) || ({} as TContext);

      // Start streaming
      ws.send(
        JSON.stringify({
          id: data.id,
          type: "stream_start",
          payload: {},
        }),
      );

      // Create a stream writer that sends chunks via WebSocket
      const streamWriter = {
        write: (chunk: string) => {
          ws.send(
            JSON.stringify({
              id: data.id,
              type: "stream_chunk",
              payload: chunk,
            }),
          );
        },
        end: () => {
          ws.send(
            JSON.stringify({
              id: data.id,
              type: "stream_end",
              payload: {},
            }),
          );
        },
      };

      // Execute streaming callbacks
      await options.streamCallbacks.onStream(context, streamWriter, template);
    } catch (error) {
      console.error("[WebSocket Stream] Error:", error);
      ws.send(
        JSON.stringify({
          id: data.id,
          type: "error",
          payload: { message: "Streaming Error", code: "STREAM_ERROR" },
        }),
      );
    } finally {
      // Always clean up resources
      if (context && options.cleanup) {
        options.cleanup(context);
      }
    }
  }

  function handleHealthCheck(ws: UWSWebSocket, data: WebSocketMessage) {
    ws.send(
      JSON.stringify({
        id: data.id,
        type: "health_response",
        payload: { status: "ok", timestamp: Date.now() },
      }),
    );
  }

  function handleResponse(data: WebSocketMessage) {
    const pending = pendingRequests.get(data.id);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingRequests.delete(data.id);

      if (data.type === "error") {
        pending.reject(new Error(data.payload.message || "Unknown error"));
      } else {
        pending.resolve(data.payload);
      }
    }
  }

  const app = uWS.App({
    // SSL configuration can be added here if needed
    // key_file_name: "path/to/key.pem",
    // cert_file_name: "path/to/cert.pem",
  });

  app.ws("/*", {
    // WebSocket configuration options
    compression: uWS.SHARED_COMPRESSOR,
    maxBackpressure: 64 * 1024, // 64KB
    maxPayloadLength: 16 * 1024 * 1024, // 16MB
    idleTimeout: 120, // 2 minutes
    sendPingsAutomatically: true,

    upgrade: (res: any, req: any, context: any) => {
      const connectionId = generateRequestId();

      // Upgrade the connection to WebSocket
      res.upgrade(
        { connectionId }, // userData
        req.getHeader("sec-websocket-key"),
        req.getHeader("sec-websocket-protocol"),
        req.getHeader("sec-websocket-extensions"),
        context,
      );
    },

    open: (ws: any) => {
      const connectionId = ws.connectionId || generateRequestId();
      const connection: WebSocketConnection<TContext> = {
        id: connectionId,
        connectedAt: Date.now(),
      };

      // Store connection data
      ws.connectionData = connection;
      connections.set(connectionId, connection);
      wsConnections.set(connectionId, ws as UWSWebSocket);

      console.log(`WebSocket connection opened: ${connectionId}`);

      if (options.onConnection) {
        options.onConnection(connection);
      }
    },

    message: (ws: any, message: any, isBinary: any) => {
      handleMessage(ws as UWSWebSocket, message);
    },

    close: (ws: any, code: any, message: any) => {
      const connection = (ws as UWSWebSocket).connectionData;
      if (connection) {
        connections.delete(connection.id);
        wsConnections.delete(connection.id);
        console.log(`WebSocket connection closed: ${connection.id} (${code})`);

        if (options.onDisconnection) {
          options.onDisconnection(
            connection,
            code,
            Buffer.from(message).toString(),
          );
        }
      }
    },
  });

  // Handle regular HTTP requests (optional)
  app.get("/*", (res: any, req: any) => {
    res
      .writeStatus("426 Upgrade Required")
      .writeHeader("Content-Type", "text/plain")
      .end("This server only accepts WebSocket connections");
  });

  const port = options.port || 3000;
  let listenSocket: any = null;

  return new Promise((resolve, reject) => {
    app.listen(port, (token: any) => {
      if (token) {
        listenSocket = token;
        console.log(`WebSocket SSR server listening on port ${port}`);
        resolve({
          app,
          connections,
          broadcast: (message: WebSocketMessage) => {
            const messageStr = JSON.stringify(message);
            wsConnections.forEach((ws, id) => {
              try {
                ws.send(messageStr);
              } catch (error) {
                console.error(`Failed to send message to ${id}:`, error);
                // Clean up dead connections
                wsConnections.delete(id);
                connections.delete(id);
              }
            });
          },
          close: () => {
            // Close all WebSocket connections first
            wsConnections.forEach((ws) => {
              try {
                ws.close();
              } catch (error) {
                console.error("Error closing WebSocket connection:", error);
              }
            });
            wsConnections.clear();
            connections.clear();

            // Close the listen socket using uWebSockets API
            if (listenSocket) {
              uWS.us_listen_socket_close(listenSocket);
              listenSocket = null;
            }
          },
        });
      } else {
        reject(new Error(`Failed to listen on port ${port}`));
      }
    });
  });
}
