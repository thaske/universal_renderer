import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("startCluster", () => {
  it("forks workers when primary", async () => {
    const fork = vi.fn();
    const on = vi.fn();
    vi.doMock("node:cluster", () => ({
      default: { isPrimary: true, fork, on },
    }));
    const { startCluster } = await import("./cluster");
    const app = { listen: vi.fn() } as any;
    startCluster(app, { workers: 2, port: 4000 });
    expect(fork).toHaveBeenCalledTimes(2);
    expect(on).toHaveBeenCalledWith("exit", expect.any(Function));
    expect(app.listen).not.toHaveBeenCalled();
  });

  it("starts server when worker", async () => {
    const listen = vi.fn((_p, _h, cb) => cb && cb());
    const fork = vi.fn();
    const on = vi.fn();
    vi.doMock("node:cluster", () => ({
      default: { isPrimary: false, worker: { id: 1 }, fork, on },
    }));
    const { startCluster } = await import("./cluster");
    const app = { listen } as any;
    startCluster(app, { port: 3000, host: "127.0.0.1" });
    expect(listen).toHaveBeenCalledWith(
      3000,
      "127.0.0.1",
      expect.any(Function),
    );
    expect(fork).not.toHaveBeenCalled();
  });
});
