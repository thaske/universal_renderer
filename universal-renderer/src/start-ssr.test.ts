import { afterEach, describe, expect, it, vi } from "vitest";

const createRenderer = vi.fn();
const createServer = vi.fn();

vi.mock("./stdio", () => ({
  createRenderer,
}));

vi.mock("./http", () => ({
  createServer,
}));

describe("ssr", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete (process.env as any).SSR_TRANSPORT;
    delete (process.env as any).SSR_PORT;
  });

  it("uses stdio transport by default", async () => {
    createRenderer.mockResolvedValue(undefined);

    const { ssr } = await import("./start-ssr");

    await ssr({
      setup: async () => ({}),
      render: async () => ({ body: "<div />" }),
    });

    expect(createRenderer).toHaveBeenCalledOnce();
    expect(createServer).not.toHaveBeenCalled();
  });

  it("uses http transport when explicitly requested", async () => {
    const listen = vi.fn((port: number, cb?: (err?: Error) => void) => cb?.());
    createServer.mockResolvedValue({ listen });

    const { ssr } = await import("./start-ssr");

    await ssr({
      transport: "http",
      setup: async () => ({}),
      render: async () => ({ body: "<div />" }),
    });

    expect(createServer).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledWith(3001, expect.any(Function));
    expect(createRenderer).not.toHaveBeenCalled();
  });

  it("uses http transport when SSR_TRANSPORT=http", async () => {
    process.env.SSR_TRANSPORT = "http";
    process.env.SSR_PORT = "4555";
    const listen = vi.fn((port: number, cb?: (err?: Error) => void) => cb?.());
    createServer.mockResolvedValue({ listen });

    const { ssr } = await import("./start-ssr");

    await ssr({
      setup: async () => ({}),
      render: async () => ({ body: "<div />" }),
    });

    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 4555 }),
    );
    expect(listen).toHaveBeenCalledWith(4555, expect.any(Function));
  });
});
