import { describe, expect, it } from "vitest";
import createServer, { SSR_MARKERS } from "./index";

describe("createServer", () => {
  it("should throw an error when no render callback is provided", async () => {
    await expect(
      createServer({
        hostname: "localhost",
        port: 3001,
      } as any),
    ).rejects.toThrow("render callback is required");
  });

  it("should accept valid render configuration", async () => {
    const serverConfig = {
      hostname: "localhost",
      port: 3001,
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
      app: () => ({ type: "div", props: { children: "Test Stream" } }) as any,
    };

    const serverConfig = {
      hostname: "localhost",
      port: 3002,
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
});

describe("SSR_MARKERS", () => {
  it("should export all required marker constants", () => {
    expect(SSR_MARKERS).toBeDefined();
    expect(SSR_MARKERS.HEAD).toBe("<!-- SSR_HEAD -->");
    expect(SSR_MARKERS.BODY).toBe("<!-- SSR_BODY -->");
    expect(SSR_MARKERS.HEAD_TEMPLATE).toBe("{{SSR_HEAD}}");
    expect(SSR_MARKERS.BODY_TEMPLATE).toBe("{{SSR_BODY}}");
  });

  it("should be a readonly object", () => {
    // Verify the object is frozen (immutable)
    expect(Object.isFrozen(SSR_MARKERS)).toBe(true);
  });
});
