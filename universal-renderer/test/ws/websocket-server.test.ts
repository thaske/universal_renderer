import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocketMessage } from "../../src/ws/websocket-types";

// Mock uWebSockets.js
const mockListenSocket = { id: "mock-listen-socket" };
const mockWebSocket = {
  send: vi.fn().mockReturnValue(true),
  close: vi.fn(),
  getRemoteAddressAsText: vi.fn().mockReturnValue(new ArrayBuffer(4)),
  connectionData: undefined as any,
  connectionId: "test-connection-id",
};

const mockApp = {
  ws: vi.fn(),
  get: vi.fn(),
  listen: vi.fn(),
};

const mockUWS = {
  App: vi.fn().mockReturnValue(mockApp),
  SHARED_COMPRESSOR: 1,
  us_listen_socket_close: vi.fn(),
};

// Mock the uWebSockets module
vi.mock("uWebSockets.js", () => ({
  default: mockUWS,
}));

// Import after mocking
const { createWebSocketServer } = await import("../../src/ws/websocket-server");

describe("WebSocket Server (uWebSockets)", () => {
  let server: any;
  let wsHandlers: any;
  let httpHandlers: any;
  let createdServers: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock WebSocket state
    mockWebSocket.connectionData = undefined;
    mockWebSocket.send.mockClear();
    mockWebSocket.close.mockClear();

    // Capture handlers when ws() is called
    mockApp.ws.mockImplementation((pattern: string, handlers: any) => {
      wsHandlers = handlers;
      return mockApp;
    });

    // Capture handlers when get() is called
    mockApp.get.mockImplementation((pattern: string, handler: any) => {
      httpHandlers = handler;
      return mockApp;
    });

    // Mock successful listen
    mockApp.listen.mockImplementation((port: number, callback: any) => {
      setTimeout(() => callback(mockListenSocket), 0);
      return mockApp;
    });
  });

  afterEach(async () => {
    // Clean up any created servers
    for (const srv of createdServers) {
      if (srv && srv.close) {
        srv.close();
      }
    }
    createdServers = [];
  });

  describe("Server Creation", () => {
    it("should create a WebSocket server with correct structure", async () => {
      server = await createWebSocketServer({
        render: async (context) => ({
          head: `<title>Test Page - ${context.url}</title>`,
          body: `<div id="app">Hello from ${context.url}</div>`,
          bodyAttrs: 'class="test-page"',
        }),
        port: 3001,
      });

      createdServers.push(server);

      expect(server).toBeDefined();
      expect(server.app).toBeDefined();
      expect(server.connections).toBeDefined();
      expect(server.broadcast).toBeTypeOf("function");
      expect(server.close).toBeTypeOf("function");

      // Verify uWebSockets App was created
      expect(mockUWS.App).toHaveBeenCalledWith({});

      // Verify WebSocket route was configured
      expect(mockApp.ws).toHaveBeenCalledWith(
        "/*",
        expect.objectContaining({
          compression: mockUWS.SHARED_COMPRESSOR,
          maxBackpressure: 64 * 1024,
          maxPayloadLength: 16 * 1024 * 1024,
          idleTimeout: 120,
          sendPingsAutomatically: true,
          upgrade: expect.any(Function),
          open: expect.any(Function),
          message: expect.any(Function),
          close: expect.any(Function),
        }),
      );

      // Verify HTTP fallback route was configured
      expect(mockApp.get).toHaveBeenCalledWith("/*", expect.any(Function));

      // Verify server listened on correct port
      expect(mockApp.listen).toHaveBeenCalledWith(3001, expect.any(Function));
    });

    it("should throw error when render callback is missing", async () => {
      await expect(async () => {
        await createWebSocketServer({
          port: 3002,
          // Missing render callback
        } as any);
      }).rejects.toThrow("render callback is required");
    });

    it("should use default port when not specified", async () => {
      server = await createWebSocketServer({
        render: async (context) => ({ body: "test" }),
      });

      createdServers.push(server);

      expect(mockApp.listen).toHaveBeenCalledWith(3000, expect.any(Function));
    });

    it("should reject when listen fails", async () => {
      mockApp.listen.mockImplementation((port: number, callback: any) => {
        setTimeout(() => callback(null), 0);
      });

      await expect(async () => {
        await createWebSocketServer({
          render: async (context) => ({ body: "test" }),
          port: 3001,
        });
      }).rejects.toThrow("Failed to listen on port 3001");
    });
  });

  describe("WebSocket Handlers", () => {
    beforeEach(async () => {
      server = await createWebSocketServer({
        setup: async (url, props) => ({ url, props, timestamp: Date.now() }),
        render: async (context) => ({
          head: `<title>Test Page - ${context.url}</title>`,
          body: `<div id="app">Hello from ${context.url}</div>`,
          bodyAttrs: 'class="test-page"',
        }),
        cleanup: vi.fn(),
        streamCallbacks: {
          onStream: async (context, writer, template) => {
            writer.write("<!DOCTYPE html><html><head>");
            writer.write(`<title>Streaming - ${context.url}</title>`);
            writer.write("</head><body>");
            writer.write(`<h1>Streaming content for ${context.url}</h1>`);
            writer.write("</body></html>");
            writer.end();
          },
        },
        port: 3001,
        onConnection: vi.fn(),
        onDisconnection: vi.fn(),
      });

      createdServers.push(server);
    });

    describe("Connection Management", () => {
      it("should handle WebSocket upgrade", () => {
        const mockRes = {
          upgrade: vi.fn(),
        };
        const mockReq = {
          getHeader: vi.fn().mockReturnValue("test-header"),
        };
        const mockContext = {};

        wsHandlers.upgrade(mockRes, mockReq, mockContext);

        expect(mockRes.upgrade).toHaveBeenCalledWith(
          expect.objectContaining({ connectionId: expect.any(String) }),
          "test-header",
          "test-header",
          "test-header",
          mockContext,
        );
      });

      it("should handle WebSocket connection open", () => {
        // Set connectionId like the upgrade handler would
        mockWebSocket.connectionId = "test-connection-id";

        wsHandlers.open(mockWebSocket);

        expect(mockWebSocket.connectionData).toBeDefined();
        expect(mockWebSocket.connectionData.id).toBeDefined();
        expect(mockWebSocket.connectionData.connectedAt).toBeTypeOf("number");
        expect(server.connections.has(mockWebSocket.connectionData.id)).toBe(
          true,
        );
      });

      it("should handle WebSocket connection close", () => {
        // Set connectionId like the upgrade handler would
        mockWebSocket.connectionId = "test-connection-id";

        // First open the connection
        wsHandlers.open(mockWebSocket);
        const connectionId = mockWebSocket.connectionData.id;
        expect(server.connections.has(connectionId)).toBe(true);

        // Then close it
        wsHandlers.close(mockWebSocket, 1000, Buffer.from("Normal closure"));

        // Verify connection is removed
        expect(server.connections.has(connectionId)).toBe(false);
      });

      it("should call lifecycle callbacks when provided", async () => {
        const onConnection = vi.fn();
        const onDisconnection = vi.fn();

        const serverWithCallbacks = await createWebSocketServer({
          render: async (context) => ({ body: "test" }),
          onConnection,
          onDisconnection,
          port: 3002,
        });

        createdServers.push(serverWithCallbacks);

        // Get the handlers for the new server
        const callbackHandlers =
          mockApp.ws.mock.calls[mockApp.ws.mock.calls.length - 1][1];

        // Simulate connection
        callbackHandlers.open(mockWebSocket);
        expect(onConnection).toHaveBeenCalledWith(mockWebSocket.connectionData);

        // Simulate disconnection
        callbackHandlers.close(
          mockWebSocket,
          1000,
          Buffer.from("Normal closure"),
        );
        expect(onDisconnection).toHaveBeenCalledWith(
          mockWebSocket.connectionData,
          1000,
          "Normal closure",
        );
      });
    });

    describe("Message Handling", () => {
      beforeEach(() => {
        // Set connectionId like the upgrade handler would
        mockWebSocket.connectionId = "test-connection-id";
        wsHandlers.open(mockWebSocket);
      });

      it("should handle SSR request messages", async () => {
        const message: WebSocketMessage = {
          id: "test-ssr-1",
          type: "ssr_request",
          payload: { url: "/test-page", props: { user: "testuser" } },
        };

        wsHandlers.message(
          mockWebSocket,
          Buffer.from(JSON.stringify(message)),
          false,
        );

        // Wait for async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Verify response was sent
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"ssr_response"'),
        );
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"id":"test-ssr-1"'),
        );
      });

      it("should handle health check messages", () => {
        const message: WebSocketMessage = {
          id: "test-health-1",
          type: "health_check",
          payload: {},
        };

        wsHandlers.message(
          mockWebSocket,
          Buffer.from(JSON.stringify(message)),
          false,
        );

        // Verify health response was sent
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"health_response"'),
        );
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"status":"ok"'),
        );
      });

      it("should handle streaming request messages", async () => {
        const message: WebSocketMessage = {
          id: "test-stream-1",
          type: "stream_request",
          payload: {
            url: "/stream-page",
            props: { test: true },
            template: "test-template",
          },
        };

        wsHandlers.message(
          mockWebSocket,
          Buffer.from(JSON.stringify(message)),
          false,
        );

        // Wait for async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Verify streaming messages were sent
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"stream_start"'),
        );
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"stream_chunk"'),
        );
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"stream_end"'),
        );
      });

      it("should handle invalid JSON gracefully", () => {
        wsHandlers.message(mockWebSocket, Buffer.from("invalid json"), false);

        // Verify error response was sent
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"error"'),
        );
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"code":"PARSE_ERROR"'),
        );
      });

      it("should handle missing URL in SSR request", () => {
        const message: WebSocketMessage = {
          id: "test-missing-url",
          type: "ssr_request",
          payload: { props: { test: true } }, // Missing URL
        };

        wsHandlers.message(
          mockWebSocket,
          Buffer.from(JSON.stringify(message)),
          false,
        );

        // Verify error response was sent
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"error"'),
        );
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"code":"MISSING_URL"'),
        );
      });

      it("should handle streaming request when streaming is not configured", async () => {
        // Create server without streaming callbacks
        const serverWithoutStreaming = await createWebSocketServer({
          render: async (context) => ({ body: "test" }),
          port: 3003,
        });

        createdServers.push(serverWithoutStreaming);

        const message: WebSocketMessage = {
          id: "test-no-streaming",
          type: "stream_request",
          payload: { url: "/test", props: {} },
        };

        // Get the handlers for the new server
        const handlers =
          mockApp.ws.mock.calls[mockApp.ws.mock.calls.length - 1][1];
        handlers.open(mockWebSocket);
        handlers.message(
          mockWebSocket,
          Buffer.from(JSON.stringify(message)),
          false,
        );

        // Verify error response was sent
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"error"'),
        );
        expect(mockWebSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"code":"STREAMING_DISABLED"'),
        );
      });

      it("should handle unknown message types", () => {
        const message = {
          id: "test-unknown",
          type: "unknown_type",
          payload: {},
        };

        // Mock console.warn to verify it's called
        const consoleSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {});

        wsHandlers.message(
          mockWebSocket,
          Buffer.from(JSON.stringify(message)),
          false,
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          "Unknown message type: unknown_type",
        );

        consoleSpy.mockRestore();
      });
    });
  });

  describe("HTTP Fallback", () => {
    beforeEach(async () => {
      server = await createWebSocketServer({
        render: async (context) => ({ body: "test" }),
        port: 3001,
      });

      createdServers.push(server);
    });

    it("should return upgrade required for HTTP requests", () => {
      const mockRes = {
        writeStatus: vi.fn().mockReturnThis(),
        writeHeader: vi.fn().mockReturnThis(),
        end: vi.fn().mockReturnThis(),
      };
      const mockReq = {};

      httpHandlers(mockRes, mockReq);

      expect(mockRes.writeStatus).toHaveBeenCalledWith("426 Upgrade Required");
      expect(mockRes.writeHeader).toHaveBeenCalledWith(
        "Content-Type",
        "text/plain",
      );
      expect(mockRes.end).toHaveBeenCalledWith(
        "This server only accepts WebSocket connections",
      );
    });
  });

  describe("Server Management", () => {
    it("should broadcast messages to all connections", async () => {
      server = await createWebSocketServer({
        render: async (context) => ({ body: "test" }),
        port: 3001,
      });

      createdServers.push(server);

      // Simulate multiple connections with unique IDs
      const mockWs1 = {
        ...mockWebSocket,
        send: vi.fn().mockReturnValue(true),
        connectionId: "conn-1",
      };
      const mockWs2 = {
        ...mockWebSocket,
        send: vi.fn().mockReturnValue(true),
        connectionId: "conn-2",
      };

      wsHandlers.open(mockWs1);
      wsHandlers.open(mockWs2);

      const broadcastMessage: WebSocketMessage = {
        id: "broadcast-test",
        type: "health_check",
        payload: {},
      };

      server.broadcast(broadcastMessage);

      const expectedMessage = JSON.stringify(broadcastMessage);
      expect(mockWs1.send).toHaveBeenCalledWith(expectedMessage);
      expect(mockWs2.send).toHaveBeenCalledWith(expectedMessage);
    });

    it("should handle broadcast errors gracefully", async () => {
      server = await createWebSocketServer({
        render: async (context) => ({ body: "test" }),
        port: 3001,
      });

      createdServers.push(server);

      // Simulate connection that throws on send
      const mockWs = {
        ...mockWebSocket,
        send: vi.fn().mockImplementation(() => {
          throw new Error("Connection closed");
        }),
        connectionId: "error-conn",
      };

      wsHandlers.open(mockWs);

      const broadcastMessage: WebSocketMessage = {
        id: "broadcast-test",
        type: "health_check",
        payload: {},
      };

      // Should not throw
      expect(() => server.broadcast(broadcastMessage)).not.toThrow();
    });

    it("should close server properly", async () => {
      server = await createWebSocketServer({
        render: async (context) => ({ body: "test" }),
        port: 3001,
      });

      // Don't add to createdServers since we're testing close manually

      // Simulate connections with unique IDs
      const mockWs1 = {
        ...mockWebSocket,
        close: vi.fn(),
        connectionId: "close-conn-1",
      };
      const mockWs2 = {
        ...mockWebSocket,
        close: vi.fn(),
        connectionId: "close-conn-2",
      };

      wsHandlers.open(mockWs1);
      wsHandlers.open(mockWs2);

      server.close();

      // Verify all connections were closed
      expect(mockWs1.close).toHaveBeenCalled();
      expect(mockWs2.close).toHaveBeenCalled();

      // Verify listen socket was closed
      expect(mockUWS.us_listen_socket_close).toHaveBeenCalledWith(
        mockListenSocket,
      );
    });
  });
});
