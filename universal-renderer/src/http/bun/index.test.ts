import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Bun createServer", () => {
  // Skip tests if not running in Bun environment
  if (typeof globalThis.Bun === "undefined") {
    it.skip("Skipping Bun HTTP tests - not running in Bun environment", () => {});
    return;
  }

  // Dynamic imports to avoid issues when Bun is not available
  let BunGlobal: any;
  let React: any;
  let createServer: any;

  beforeAll(async () => {
    BunGlobal = globalThis.Bun;
    React = await import("react");
    const serverModule = await import("./server");
    createServer = serverModule.createServer;
  });

  const getTestPort = () => 30000 + Math.floor(Math.random() * 1000); // Dynamic port to avoid conflicts

  let serverInstance: any = null;

  afterAll(async () => {
    if (serverInstance) {
      await serverInstance.stop(true); // true for forceful stop
      serverInstance = null;
    }
  });

  it("should throw an error when no render callback is provided", async () => {
    await expect(createServer({} as any)).rejects.toThrow(
      "render callback is required",
    );
  });

  it("should accept valid render configuration and start/stop server", async () => {
    const testPort = getTestPort();
    const serverConfig = {
      port: testPort,
      setup: async () => ({ test: "context" }),
      render: async (context: any) => ({
        head: `<title>Test Bun ${context.test}</title>`,
        body: "<div>Test Bun SSR</div>",
      }),
      cleanup: () => {
        console.log("Cleanup called for Bun SSR test");
      },
    };

    const server = await createServer(serverConfig);
    expect(server).toBeDefined();
    expect(server.fetch).toBeInstanceOf(Function);
    expect(server.port).toBe(testPort);

    // Start the server
    serverInstance = BunGlobal.serve(server);
    expect(serverInstance).toBeDefined();
    if (serverInstance) {
      expect(serverInstance.port).toBe(testPort);
    }

    // Test health endpoint
    const healthRes = await fetch(`http://localhost:${testPort}/health`);
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as { status: string };
    expect(healthJson.status).toBe("OK");

    // Test SSR endpoint
    const ssrRes = await fetch(`http://localhost:${testPort}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/test", props: { message: "Hello Bun" } }),
    });
    expect(ssrRes.status).toBe(200);
    const ssrJson = (await ssrRes.json()) as { head: string; body: string };
    expect(ssrJson.head).toBe("<title>Test Bun context</title>");
    expect(ssrJson.body).toBe("<div>Test Bun SSR</div>");

    // Stop the server (handled by afterAll)
  });

  it("should accept valid stream configuration and start/stop server", async () => {
    const testPort = getTestPort();
    const mockStreamCallbacks = {
      node: (context: any) =>
        React.createElement(
          "div",
          null,
          `Test Bun Stream ${context.streamTest}`,
        ),
      head: async (context: any) =>
        `<meta name=\"stream-test\" content=\"${context.streamTest}\">`,
    };

    const serverConfig = {
      port: testPort,
      setup: async () => ({ streamTest: "data" }),
      render: async () => ({ body: "fallback" }), // Required but not used for streaming
      cleanup: () => {
        console.log("Cleanup called for Bun stream test");
      },
      streamCallbacks: mockStreamCallbacks,
    };

    const server = await createServer(serverConfig);
    expect(server).toBeDefined();
    expect(server.fetch).toBeInstanceOf(Function);
    expect(server.port).toBe(testPort);

    serverInstance = BunGlobal.serve(server); // Reassign for cleanup
    expect(serverInstance).toBeDefined();
    if (serverInstance) {
      expect(serverInstance.port).toBe(testPort);
    }

    // Test stream endpoint
    const streamRes = await fetch(`http://localhost:${testPort}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "/test-stream",
        props: { user: "Bun User" },
        template:
          "<html><head><!-- SSR_HEAD --></head><body><!-- SSR_BODY --></body></html>",
      }),
    });
    expect(streamRes.status).toBe(200);
    const streamHtml = await streamRes.text();
    expect(streamHtml).toContain('<meta name="stream-test" content="data">');
    expect(streamHtml).toContain("<div>Test Bun Stream data</div>");
    expect(streamHtml.startsWith("<html><head>")).toBe(true);
    expect(streamHtml.trim()).toMatch(/<\/body>\s*<\/html>$/);

    // Stop the server (handled by afterAll, will stop the last assigned serverInstance)
  });

  // Add more tests for error handling, specific handler logic, etc.
});
