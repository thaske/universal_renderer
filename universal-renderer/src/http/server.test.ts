import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startServer, warnIfDevelopmentBuild } from "./server";

const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

afterEach(() => warn.mockClear());

describe("warnIfDevelopmentBuild", () => {
  it("stays quiet for a production build", () => {
    warnIfDevelopmentBuild("production");

    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, "unset"],
    ["development", '"development"'],
  ])("warns that the logs will fill up when NODE_ENV is %s", (nodeEnv, shown) => {
    warnIfDevelopmentBuild(nodeEnv);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`process.env.NODE_ENV is ${shown}`));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("fills production logs"));
  });
});

describe("startServer", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise((resolve) => server!.close(resolve));
    server = undefined;
  });

  const start = async (options: { warnDevelopmentBuild?: boolean }) => {
    // Vitest runs with NODE_ENV=test, which is a development build.
    ({ server } = await startServer({
      setup: () => ({}),
      render: () => ({ body: "" }),
      port: 32000 + Math.floor(Math.random() * 2000),
      log: false,
      ...options,
    }));
  };

  it("warns at startup when it runs a development build", async () => {
    await start({});

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NODE_ENV is "test"'));
  });

  it("stays quiet when the development renderer turns the warning off", async () => {
    await start({ warnDevelopmentBuild: false });

    expect(warn).not.toHaveBeenCalled();
  });
});
