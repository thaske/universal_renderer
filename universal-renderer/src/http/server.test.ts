import { afterEach, describe, expect, it, vi } from "vitest";

import { warnIfDevelopmentBuild } from "./server";

describe("warnIfDevelopmentBuild", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  afterEach(() => warn.mockClear());

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
