import type { ServerWebSocket } from "bun";
import type {
  WebSocketConnection,
  WebSocketMessage,
  WebSocketServerOptions,
} from "./websocket-types";

/**
 * Creates a WebSocket server for Server-Side Rendering using Bun's native WebSocket API.
 *
 * This replaces the Express-based HTTP server with a high-performance WebSocket server
 * that maintains the same rendering capabilities while enabling real-time bidirectional
 * communication between the Ruby gem and the Node.js service.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for the WebSocket SSR server
 * @returns Promise that resolves to a Bun server instance
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
  const pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: Timer;
    }
  >();

  function generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  function handleMessage(
    ws: ServerWebSocket<WebSocketConnection<TContext>>,
    message: string | Buffer,
  ) {
    try {
      const data: WebSocketMessage = JSON.parse(message.toString());
      const connection = ws.data;

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

  async function handleSSRRequest(
    ws: ServerWebSocket<WebSocketConnection<TContext>>,
    data: WebSocketMessage,
  ) {
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

  async function handleStreamRequest(
    ws: ServerWebSocket<WebSocketConnection<TContext>>,
    data: WebSocketMessage,
  ) {
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

  function handleHealthCheck(
    ws: ServerWebSocket<WebSocketConnection<TContext>>,
    data: WebSocketMessage,
  ) {
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

  const server = Bun.serve({
    port: options.port || 3000,
    fetch(req, server) {
      // Upgrade all requests to WebSocket connections
      const success = server.upgrade(req, {
        data: {
          id: generateRequestId(),
          connectedAt: Date.now(),
        } as WebSocketConnection<TContext>,
      });

      if (success) {
        return undefined; // Connection upgraded successfully
      }

      return new Response("WebSocket upgrade failed", { status: 400 });
    },
    websocket: {
      open(ws) {
        const connection = ws.data as WebSocketConnection<TContext>;
        connections.set(connection.id, connection);
        console.log(`WebSocket connection opened: ${connection.id}`);

        if (options.onConnection) {
          options.onConnection(connection);
        }
      },
      message(ws, message) {
        handleMessage(
          ws as ServerWebSocket<WebSocketConnection<TContext>>,
          message,
        );
      },
      close(ws, code, message) {
        const connection = ws.data as WebSocketConnection<TContext>;
        connections.delete(connection.id);
        console.log(`WebSocket connection closed: ${connection.id} (${code})`);

        if (options.onDisconnection) {
          options.onDisconnection(connection, code, message);
        }
      },
      // Note: Bun's WebSocket API doesn't include an error handler in the websocket options
      // Error handling is done through try-catch blocks in message handlers
      // Configure WebSocket settings for optimal performance
      maxPayloadLength: 16 * 1024 * 1024, // 16MB
      idleTimeout: 120, // 2 minutes
      backpressureLimit: 1024 * 1024, // 1MB
      closeOnBackpressureLimit: false,
      sendPings: true,
    },
  });

  console.log(`WebSocket SSR server listening on port ${server.port}`);

  return {
    server,
    connections,
    broadcast: (message: WebSocketMessage) => {
      const messageStr = JSON.stringify(message);
      connections.forEach((connection, id) => {
        // Note: We'd need to store the actual WebSocket reference to send messages
        // This is a simplified version - in practice, we'd need to maintain
        // a mapping of connection IDs to WebSocket instances
      });
    },
    close: () => {
      server.stop();
    },
  };
}
