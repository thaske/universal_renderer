import { describe, expect, it } from "vitest";
import { createServer } from "./index";

describe("Fastify createServer", () => {
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
    // Fastify server has `server.listen` but it's on `server.server.listen`
    // We can check for a method that is directly on the fastify instance like `ready`
    expect(typeof server.ready).toBe("function");
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
    expect(typeof server.ready).toBe("function");
  });
});
