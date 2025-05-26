import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocketMessage } from "./websocket-types";

// Mock Bun for testing in Node.js environment
const mockServer = {
  port: 3001,
  stop: vi.fn(),
};

const mockWebSocket = {
  send: vi.fn(),
  close: vi.fn(),
  data: { id: "test-connection", connectedAt: Date.now() },
};

const mockBun = {
  serve: vi.fn().mockReturnValue(mockServer),
};

// Mock Bun globally
(global as any).Bun = mockBun;

// Import after mocking Bun
const { createWebSocketServer } = await import("./websocket-server");

describe("WebSocket Server", () => {
  let server: any;
  let mockWebSocketHandlers: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Capture WebSocket handlers when Bun.serve is called
    mockBun.serve.mockImplementation((config) => {
      mockWebSocketHandlers = config.websocket;
      return mockServer;
    });
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

      expect(server).toBeDefined();
      expect(server.server).toBeDefined();
      expect(server.connections).toBeDefined();
      expect(server.broadcast).toBeTypeOf("function");
      expect(server.close).toBeTypeOf("function");
      expect(mockBun.serve).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3001,
          fetch: expect.any(Function),
          websocket: expect.objectContaining({
            open: expect.any(Function),
            message: expect.any(Function),
            close: expect.any(Function),
          }),
        }),
      );
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
      await createWebSocketServer({
        render: async (context) => ({ body: "test" }),
      });

      expect(mockBun.serve).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3000,
        }),
      );
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
        onError: vi.fn(),
      });
    });

    describe("Connection Management", () => {
      it("should handle WebSocket connection open", () => {
        expect(mockWebSocketHandlers.open).toBeDefined();

        mockWebSocketHandlers.open(mockWebSocket);

        // Verify connection is tracked
        expect(server.connections.has(mockWebSocket.data.id)).toBe(true);
      });

      it("should handle WebSocket connection close", () => {
        expect(mockWebSocketHandlers.close).toBeDefined();

        // First open the connection
        mockWebSocketHandlers.open(mockWebSocket);
        expect(server.connections.has(mockWebSocket.data.id)).toBe(true);

        // Then close it
        mockWebSocketHandlers.close(mockWebSocket, 1000, "Normal closure");

        // Verify connection is removed
        expect(server.connections.has(mockWebSocket.data.id)).toBe(false);
      });
    });

    describe("Message Handling", () => {
      beforeEach(() => {
        mockWebSocketHandlers.open(mockWebSocket);
      });

      it("should handle SSR request messages", async () => {
        const message: WebSocketMessage = {
          id: "test-ssr-1",
          type: "ssr_request",
          payload: { url: "/test-page", props: { user: "testuser" } },
        };

        mockWebSocketHandlers.message(mockWebSocket, JSON.stringify(message));

        // Wait for async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 0));

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

        mockWebSocketHandlers.message(mockWebSocket, JSON.stringify(message));

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

        mockWebSocketHandlers.message(mockWebSocket, JSON.stringify(message));

        // Wait for async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 0));

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
        mockWebSocketHandlers.message(mockWebSocket, "invalid json");

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

        mockWebSocketHandlers.message(mockWebSocket, JSON.stringify(message));

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

        const message: WebSocketMessage = {
          id: "test-no-streaming",
          type: "stream_request",
          payload: { url: "/test", props: {} },
        };

        // Get the handlers for the new server
        const handlers =
          mockBun.serve.mock.calls[mockBun.serve.mock.calls.length - 1][0]
            .websocket;
        handlers.open(mockWebSocket);
        handlers.message(mockWebSocket, JSON.stringify(message));

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

        mockWebSocketHandlers.message(mockWebSocket, JSON.stringify(message));

        expect(consoleSpy).toHaveBeenCalledWith(
          "Unknown message type: unknown_type",
        );

        consoleSpy.mockRestore();
      });
    });
  });

  describe("Server Configuration", () => {
    it("should configure WebSocket settings correctly", async () => {
      await createWebSocketServer({
        render: async (context) => ({ body: "test" }),
        port: 3001,
      });

      expect(mockBun.serve).toHaveBeenCalledWith(
        expect.objectContaining({
          websocket: expect.objectContaining({
            maxPayloadLength: 16 * 1024 * 1024, // 16MB
            idleTimeout: 120, // 2 minutes
            backpressureLimit: 1024 * 1024, // 1MB
            closeOnBackpressureLimit: false,
            sendPings: true,
          }),
        }),
      );
    });

    it("should call lifecycle callbacks when provided", async () => {
      const onConnection = vi.fn();
      const onDisconnection = vi.fn();

      server = await createWebSocketServer({
        render: async (context) => ({ body: "test" }),
        onConnection,
        onDisconnection,
        port: 3001,
      });

      // Simulate connection
      mockWebSocketHandlers.open(mockWebSocket);
      expect(onConnection).toHaveBeenCalledWith(mockWebSocket.data);

      // Simulate disconnection
      mockWebSocketHandlers.close(mockWebSocket, 1000, "Normal closure");
      expect(onDisconnection).toHaveBeenCalledWith(
        mockWebSocket.data,
        1000,
        "Normal closure",
      );
    });
  });

  describe("HTTP Upgrade", () => {
    it("should upgrade HTTP requests to WebSocket", async () => {
      server = await createWebSocketServer({
        render: async (context) => ({ body: "test" }),
        port: 3001,
      });

      const mockRequest = new Request("http://localhost:3001");
      const mockServerUpgrade = {
        upgrade: vi.fn().mockReturnValue(true),
      };

      const config = mockBun.serve.mock.calls[0][0];
      const result = config.fetch(mockRequest, mockServerUpgrade);

      expect(mockServerUpgrade.upgrade).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          data: expect.objectContaining({
            id: expect.any(String),
            connectedAt: expect.any(Number),
          }),
        }),
      );
      expect(result).toBeUndefined();
    });

    it("should return error response when upgrade fails", async () => {
      server = await createWebSocketServer({
        render: async (context) => ({ body: "test" }),
        port: 3001,
      });

      const mockRequest = new Request("http://localhost:3001");
      const mockServerUpgrade = {
        upgrade: vi.fn().mockReturnValue(false),
      };

      const config = mockBun.serve.mock.calls[0][0];
      const result = config.fetch(mockRequest, mockServerUpgrade);

      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(400);
    });
  });
});
