import { describe, expect, it } from "vitest";
import type {
  ErrorPayload,
  HealthResponsePayload,
  SSRRequestPayload,
  StreamRequestPayload,
  WebSocketConnection,
  WebSocketMessage,
  WebSocketServerOptions,
  WebSocketStreamWriter,
} from "./websocket-types";

describe("WebSocket Types", () => {
  describe("WebSocketMessage", () => {
    it("should accept valid SSR request message", () => {
      const message: WebSocketMessage = {
        id: "test-123",
        type: "ssr_request",
        payload: {
          url: "/test",
          props: { user: "test" },
        },
      };

      expect(message.id).toBe("test-123");
      expect(message.type).toBe("ssr_request");
      expect(message.payload.url).toBe("/test");
    });

    it("should accept valid SSR response message", () => {
      const message: WebSocketMessage = {
        id: "test-123",
        type: "ssr_response",
        payload: {
          head: "<title>Test</title>",
          body: "<div>Content</div>",
          bodyAttrs: 'class="test"',
        },
      };

      expect(message.type).toBe("ssr_response");
      expect(message.payload.head).toBe("<title>Test</title>");
    });

    it("should accept valid streaming messages", () => {
      const streamStart: WebSocketMessage = {
        id: "stream-1",
        type: "stream_start",
        payload: {},
      };

      const streamChunk: WebSocketMessage = {
        id: "stream-1",
        type: "stream_chunk",
        payload: "<div>chunk content</div>",
      };

      const streamEnd: WebSocketMessage = {
        id: "stream-1",
        type: "stream_end",
        payload: {},
      };

      expect(streamStart.type).toBe("stream_start");
      expect(streamChunk.type).toBe("stream_chunk");
      expect(streamEnd.type).toBe("stream_end");
    });

    it("should accept health check messages", () => {
      const healthCheck: WebSocketMessage = {
        id: "health-1",
        type: "health_check",
        payload: {},
      };

      const healthResponse: WebSocketMessage = {
        id: "health-1",
        type: "health_response",
        payload: {
          status: "ok",
          timestamp: Date.now(),
        },
      };

      expect(healthCheck.type).toBe("health_check");
      expect(healthResponse.type).toBe("health_response");
    });

    it("should accept error messages", () => {
      const errorMessage: WebSocketMessage = {
        id: "error-1",
        type: "error",
        payload: {
          message: "Something went wrong",
          code: "INTERNAL_ERROR",
        },
      };

      expect(errorMessage.type).toBe("error");
      expect(errorMessage.payload.message).toBe("Something went wrong");
      expect(errorMessage.payload.code).toBe("INTERNAL_ERROR");
    });
  });

  describe("WebSocketConnection", () => {
    it("should have required properties", () => {
      const connection: WebSocketConnection = {
        id: "conn-123",
        connectedAt: Date.now(),
      };

      expect(connection.id).toBe("conn-123");
      expect(connection.connectedAt).toBeTypeOf("number");
    });

    it("should accept optional context", () => {
      const connection: WebSocketConnection<{ user: string }> = {
        id: "conn-123",
        connectedAt: Date.now(),
        context: { user: "testuser" },
      };

      expect(connection.context?.user).toBe("testuser");
    });
  });

  describe("WebSocketStreamWriter", () => {
    it("should have write and end methods", () => {
      const writer: WebSocketStreamWriter = {
        write: (chunk: string) => {
          // Mock implementation
        },
        end: () => {
          // Mock implementation
        },
      };

      expect(writer.write).toBeTypeOf("function");
      expect(writer.end).toBeTypeOf("function");
    });
  });

  describe("WebSocketServerOptions", () => {
    it("should accept minimal configuration", () => {
      const options: WebSocketServerOptions = {
        render: async (context) => ({
          body: "test content",
        }),
      };

      expect(options.render).toBeTypeOf("function");
    });

    it("should accept full configuration", () => {
      const options: WebSocketServerOptions<{ url: string; props: any }> = {
        setup: async (url, props) => ({ url, props }),
        render: async (context) => ({
          head: "<title>Test</title>",
          body: "<div>Content</div>",
          bodyAttrs: 'class="test"',
        }),
        cleanup: (context) => {
          // Cleanup logic
        },
        streamCallbacks: {
          onStream: async (context, writer, template) => {
            writer.write("content");
            writer.end();
          },
        },
        port: 3000,
        onConnection: (connection) => {
          // Connection handler
        },
        onDisconnection: (connection, code, message) => {
          // Disconnection handler
        },
        onError: (connection, error) => {
          // Error handler
        },
      };

      expect(options.setup).toBeTypeOf("function");
      expect(options.render).toBeTypeOf("function");
      expect(options.cleanup).toBeTypeOf("function");
      expect(options.streamCallbacks).toBeDefined();
      expect(options.port).toBe(3000);
      expect(options.onConnection).toBeTypeOf("function");
      expect(options.onDisconnection).toBeTypeOf("function");
      expect(options.onError).toBeTypeOf("function");
    });
  });

  describe("Payload Types", () => {
    it("should validate SSRRequestPayload", () => {
      const payload: SSRRequestPayload = {
        url: "/test-page",
        props: {
          user: "testuser",
          data: { id: 123 },
        },
      };

      expect(payload.url).toBe("/test-page");
      expect(payload.props?.user).toBe("testuser");
    });

    it("should validate StreamRequestPayload", () => {
      const payload: StreamRequestPayload = {
        url: "/stream-page",
        props: { data: "test" },
        template: "<html>{{content}}</html>",
      };

      expect(payload.url).toBe("/stream-page");
      expect(payload.template).toBe("<html>{{content}}</html>");
    });

    it("should validate ErrorPayload", () => {
      const payload: ErrorPayload = {
        message: "Request failed",
        code: "REQUEST_ERROR",
      };

      expect(payload.message).toBe("Request failed");
      expect(payload.code).toBe("REQUEST_ERROR");
    });

    it("should validate HealthResponsePayload", () => {
      const okPayload: HealthResponsePayload = {
        status: "ok",
        timestamp: Date.now(),
      };

      const errorPayload: HealthResponsePayload = {
        status: "error",
        timestamp: Date.now(),
      };

      expect(okPayload.status).toBe("ok");
      expect(errorPayload.status).toBe("error");
      expect(okPayload.timestamp).toBeTypeOf("number");
    });
  });

  describe("Type Safety", () => {
    it("should enforce message type constraints", () => {
      // This test verifies TypeScript compilation
      // If types are incorrect, this won't compile

      const messages: WebSocketMessage[] = [
        { id: "1", type: "ssr_request", payload: { url: "/test" } },
        { id: "2", type: "ssr_response", payload: { body: "content" } },
        { id: "3", type: "stream_start", payload: {} },
        { id: "4", type: "stream_chunk", payload: "chunk" },
        { id: "5", type: "stream_end", payload: {} },
        { id: "6", type: "health_check", payload: {} },
        {
          id: "7",
          type: "health_response",
          payload: { status: "ok", timestamp: Date.now() },
        },
        { id: "8", type: "error", payload: { message: "Error", code: "ERR" } },
      ];

      expect(messages).toHaveLength(8);
    });

    it("should enforce server options type constraints", () => {
      // Test that TypeScript enforces correct types
      interface TestContext {
        url: string;
        props: Record<string, any>;
      }

      const options: WebSocketServerOptions<TestContext> = {
        setup: async (url: string, props: any): Promise<TestContext> => ({
          url,
          props,
        }),
        render: async (context: TestContext) => ({
          body: `Rendered ${context.url}`,
        }),
        cleanup: (context: TestContext) => {
          // Context is properly typed
          expect(context.url).toBeTypeOf("string");
        },
      };

      expect(options.render).toBeTypeOf("function");
    });
  });
});
