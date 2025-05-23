import { beforeEach, describe, expect, it, vi } from "vitest";
import createHandler from "./handler";

describe("createHandler", () => {
  const mockCallbacks = {
    setup: vi.fn(),
    render: vi.fn(),
    cleanup: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("request validation", () => {
    it("should return 400 error when URL is missing", async () => {
      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ props: {} }),
      });

      const response = await handler(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json).toEqual({ error: "URL is required in the request body." });
      expect(mockCallbacks.setup).not.toHaveBeenCalled();
    });

    it("should handle invalid JSON body gracefully", async () => {
      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: "invalid json",
      });

      const response = await handler(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json).toEqual({ error: "URL is required in the request body." });
    });

    it("should default props to empty object when missing", async () => {
      mockCallbacks.setup.mockResolvedValue({ test: "context" });
      mockCallbacks.render.mockResolvedValue({ head: "", body: "test" });

      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ url: "/test" }),
      });

      await handler(request);

      expect(mockCallbacks.setup).toHaveBeenCalledWith("/test", {});
    });
  });

  describe("setup callback", () => {
    it("should return 500 error when setup returns null context", async () => {
      mockCallbacks.setup.mockResolvedValue(null);

      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ url: "/test", props: { id: 1 } }),
      });

      const response = await handler(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json).toEqual({
        error:
          "Server Error: Application setup failed to produce a valid context.",
      });
      expect(mockCallbacks.setup).toHaveBeenCalledWith("/test", { id: 1 });
      expect(mockCallbacks.render).not.toHaveBeenCalled();
    });

    it("should return 500 error when setup returns undefined context", async () => {
      mockCallbacks.setup.mockResolvedValue(undefined);

      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ url: "/test" }),
      });

      const response = await handler(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json).toEqual({
        error:
          "Server Error: Application setup failed to produce a valid context.",
      });
    });
  });

  describe("render callback", () => {
    it("should return 500 error when render callback is missing", async () => {
      const callbacksWithoutRender = {
        setup: vi.fn().mockResolvedValue({ test: "context" }),
        cleanup: vi.fn(),
      };

      const handler = createHandler({
        callbacks: callbacksWithoutRender as any,
      });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ url: "/test" }),
      });

      const response = await handler(request);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json).toEqual({
        error:
          "Rendering is not configured on the server (callbacks.render missing).",
      });
    });

    it("should return JSON response with render result on success", async () => {
      const mockContext = { app: "test-app" };
      const mockRenderResult = {
        head: "<title>Test</title>",
        body: "<div>Test</div>",
      };

      mockCallbacks.setup.mockResolvedValue(mockContext);
      mockCallbacks.render.mockResolvedValue(mockRenderResult);

      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ url: "/test", props: { id: 123 } }),
      });

      const response = await handler(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual(mockRenderResult);
      expect(mockCallbacks.setup).toHaveBeenCalledWith("/test", { id: 123 });
      expect(mockCallbacks.render).toHaveBeenCalledWith(mockContext);
    });
  });

  describe("cleanup behavior", () => {
    it("should call cleanup when context is created", async () => {
      const mockContext = { test: "context" };
      mockCallbacks.setup.mockResolvedValue(mockContext);
      mockCallbacks.render.mockResolvedValue({ head: "", body: "test" });

      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ url: "/test" }),
      });

      await handler(request);

      expect(mockCallbacks.cleanup).toHaveBeenCalledWith(mockContext);
    });

    it("should not call cleanup when setup fails", async () => {
      mockCallbacks.setup.mockResolvedValue(null);

      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ url: "/test" }),
      });

      await handler(request);

      expect(mockCallbacks.cleanup).not.toHaveBeenCalled();
    });

    it("should call cleanup even when render throws error", async () => {
      const mockContext = { test: "context" };
      mockCallbacks.setup.mockResolvedValue(mockContext);
      mockCallbacks.render.mockRejectedValue(new Error("Render failed"));

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ url: "/test" }),
      });

      const response = await handler(request);

      expect(response.status).toBe(500);
      expect(mockCallbacks.cleanup).toHaveBeenCalledWith(mockContext);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[SSR] Render error:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("error handling", () => {
    it("should return 500 response when setup throws error", async () => {
      mockCallbacks.setup.mockRejectedValue(new Error("Setup failed"));

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ url: "/test" }),
      });

      const response = await handler(request);

      expect(response.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[SSR] Render error:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("should return 500 response when render throws error", async () => {
      const mockContext = { test: "context" };
      mockCallbacks.setup.mockResolvedValue(mockContext);
      mockCallbacks.render.mockRejectedValue(new Error("Render failed"));

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const handler = createHandler({ callbacks: mockCallbacks });
      const request = new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ url: "/test" }),
      });

      const response = await handler(request);

      expect(response.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[SSR] Render error:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
