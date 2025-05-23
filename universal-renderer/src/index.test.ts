import { describe, expect, it } from "vitest";
import { createServer } from "./index";

describe("createServer", () => {
  it("should throw an error when no render callback is provided", async () => {
    await expect(
      createServer({
        hostname: "localhost",
        port: 3001,
      } as any),
    ).rejects.toThrow(
      "Either `callbacks.render` or `streamCallbacks` must be provided.",
    );
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
    expect(server.hostname).toBe("localhost");
    expect(server.port).toBe(3001);
  });

  it("should accept valid stream configuration", async () => {
    const mockStreamCallbacks = {
      app: () => "Test Stream",
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
    expect(server.hostname).toBe("localhost");
    expect(server.port).toBe(3002);
  });
});
