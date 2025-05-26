import { describe, expect, it } from "vitest";
import { createServer } from "./server";

describe("createServer", () => {
  it("should create an Express application", async () => {
    const server = await createServer({
      hostname: "localhost",
      port: 3001,
      setup: async () => ({ jsx: "test" }),
      render: async () => ({
        head: "<title>Test</title>",
        body: "<div>Test</div>",
      }),
    });

    expect(server).toBeDefined();
    expect(typeof server.listen).toBe("function");
  });

  it("should throw error when no render callback is provided", async () => {
    await expect(
      createServer({
        hostname: "localhost",
        port: 3001,
        setup: async () => ({}),
      } as any),
    ).rejects.toThrow();
  });

  it("should accept streaming configuration", async () => {
    const server = await createServer({
      hostname: "localhost",
      port: 3002,
      setup: async () => ({ jsx: "test" }),
      render: async () => ({
        head: "<title>Test</title>",
        body: "<div>Test</div>",
      }),
      streamCallbacks: {
        app: () => "Test Stream" as any,
      },
    });

    expect(server).toBeDefined();
    expect(typeof server.listen).toBe("function");
  });
});
