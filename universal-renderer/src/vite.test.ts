import { describe, expect, it } from "vitest";

import { defineSsrConfig } from "./vite";

describe("defineSsrConfig", () => {
  it("preserves the global shim when custom definitions are supplied", () => {
    const config = defineSsrConfig({
      entry: "app/frontend/ssr/server.ts",
      define: { "process.env.APP_ENV": '"production"' },
    });

    expect(config.define).toEqual({
      global: "globalThis",
      "process.env.APP_ENV": '"production"',
    });
  });
});
