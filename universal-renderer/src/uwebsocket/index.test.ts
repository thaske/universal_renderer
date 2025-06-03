import { describe, expect, it } from "vitest";

describe.skip("uWebSockets createServer", () => {
  it("should throw an error when no render callback is provided", async () => {
    const { default: createServer } = await import("./index");
    await expect(createServer({} as any)).rejects.toThrow(
      "render callback is required",
    );
  });

  it("should accept valid render configuration", async () => {
    const { default: createServer } = await import("./index");
    const server = await createServer({
      setup: async () => ({}),
      render: async () => ({ body: "<div>test</div>" }),
      cleanup: () => {},
    });
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe("function");
  });
});
