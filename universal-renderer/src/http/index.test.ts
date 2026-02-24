import { describe, expect, it } from "vitest";
import { createServer } from "./server";

describe("Express createServer", () => {
  it("should throw an error when no render callback is provided", async () => {
    await expect(createServer({} as any)).rejects.toThrow(
      "render callback is required",
    );
  });

  it("should accept valid render configuration", async () => {
    const serverConfig = {
      setup: async () => ({}),
      render: async () => ({
        head: "<title>Test</title>",
        body: "<div>Test</div>",
      }),
      cleanup: () => {},
    };

    const server = await createServer(serverConfig);
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe("function");
  });

  it("should accept valid stream configuration", async () => {
    const mockStreamCallbacks = {
      node: () => ({ type: "div", props: { children: "Test Stream" } }) as any,
    };

    const serverConfig = {
      setup: async () => ({}),
      render: async () => ({
        head: "<title>Test</title>",
        body: "<div>Test</div>",
      }),
      cleanup: () => {},
      streamCallbacks: mockStreamCallbacks,
    };

    const server = await createServer(serverConfig);
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe("function");
  });

  it("should handle actual HTTP requests (smoke test)", async () => {
    const serverConfig = {
      setup: async () => ({ test: "express-context" }),
      render: async (context: any) => ({
        head: `<title>Express ${context.test}</title>`,
        body: "<div>Express SSR Test</div>",
      }),
      cleanup: () => {},
    };

    const app = await createServer(serverConfig);

    // Use a dynamic port to avoid conflicts
    const port = 30000 + Math.floor(Math.random() * 1000);

    const server = app.listen(port, "127.0.0.1");

    try {
      // Wait a bit for server to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Test health endpoint
      const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
      expect(healthRes.status).toBe(200);
      const healthJson = await healthRes.json() as { status: string };
      expect(healthJson.status).toBe("OK");

      // Test SSR endpoint
      const ssrRes = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "/test", props: { message: "Hello Express" } }),
      });
      expect(ssrRes.status).toBe(200);
      const ssrJson = await ssrRes.json() as { head: string; body: string };
      expect(ssrJson.head).toBe("<title>Express express-context</title>");
      expect(ssrJson.body).toBe("<div>Express SSR Test</div>");
    } finally {
      server.close();
    }
  });
});
