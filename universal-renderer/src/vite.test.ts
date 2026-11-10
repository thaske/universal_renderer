// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defineSsrConfig } from "./vite";

const entry = "app/frontend/ssr/server.ts";

// Vitest runs with NODE_ENV=test. Builds on a host without NODE_ENV are the case
// that matters, so most examples start from there.
const originalNodeEnv = process.env.NODE_ENV;
beforeEach(() => {
  delete process.env.NODE_ENV;
});
afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("defineSsrConfig", () => {
  it("preserves the defaults when custom definitions are supplied", () => {
    const config = defineSsrConfig({
      entry,
      define: { "process.env.APP_ENV": '"production"' },
    });

    expect(config.define).toEqual({
      global: "globalThis",
      "process.env.NODE_ENV": '"production"',
      "process.env.APP_ENV": '"production"',
    });
  });

  it("uses the NODE_ENV the build runs with, like Vite's client builds", () => {
    process.env.NODE_ENV = "development";

    expect(defineSsrConfig({ entry }).define?.["process.env.NODE_ENV"]).toBe('"development"');
  });

  it("lets the app override NODE_ENV and the bundling defaults", () => {
    const config = defineSsrConfig({
      entry,
      define: { "process.env.NODE_ENV": '"development"' },
      ssr: { noExternal: ["some-lib"] },
    });

    expect(config.define?.["process.env.NODE_ENV"]).toBe('"development"');
    expect(config.ssr?.noExternal).toEqual(["some-lib"]);
  });

  it("keeps client-only packages external alongside the bundling default", () => {
    const config = defineSsrConfig({ entry, ssr: { external: ["react-pdf"] } });

    expect(config.ssr).toEqual({ noExternal: true, external: ["react-pdf"] });
  });

  it("merges rollupOptions and rolldownOptions into one object under both names", () => {
    const config = defineSsrConfig({
      entry,
      build: {
        rollupOptions: { external: ["a"], output: { banner: "/* a */" } },
        rolldownOptions: { treeshake: false, output: { footer: "/* b */" } },
      },
    });
    const build = config.build as Record<string, unknown>;

    expect(build.rolldownOptions).toBe(build.rollupOptions);
    expect(build.rollupOptions).toEqual({
      external: ["a"],
      treeshake: false,
      output: { format: "esm", entryFileNames: "server.mjs", banner: "/* a */", footer: "/* b */" },
    });
  });

  it("rejects an array of outputs from either option name", () => {
    expect(() => defineSsrConfig({ entry, build: { rolldownOptions: { output: [{}] } } })).toThrow(
      /single output object/,
    );
  });

  // The two production failures this guards against: a renderer that cannot
  // resolve its dependencies once node_modules is pruned, and one that runs
  // development builds because the host sets no NODE_ENV.
  describe.each([
    ["Vite 6", "vite"],
    ["Vite 8", "vite8"],
  ])("a real build with %s", (_name, vitePackage) => {
    it("runs without node_modules and takes production code paths", async () => {
      const { build } = (await import(vitePackage)) as typeof import("vite");
      const root = mkdtempSync(join(tmpdir(), "ur-ssr-build-"));
      try {
        const lib = join(root, "node_modules/fake-lib");
        mkdirSync(lib, { recursive: true });
        writeFileSync(
          join(lib, "package.json"),
          JSON.stringify({ name: "fake-lib", type: "module", main: "index.js" }),
        );
        writeFileSync(
          join(lib, "index.js"),
          'export const mode = process.env.NODE_ENV === "production" ? "production" : "development";\n',
        );
        writeFileSync(
          join(root, "server.ts"),
          'import { sep } from "node:path";\nimport { mode } from "fake-lib";\nexport const result = { mode, sep };\n',
        );

        await build({ ...defineSsrConfig({ entry: "server.ts", root }), logLevel: "silent" });
        rmSync(join(root, "node_modules"), { recursive: true });

        const bundlePath = join(root, "ssr-build/server.mjs");
        expect(readFileSync(bundlePath, "utf8")).not.toContain("fake-lib");

        // A separate process with no NODE_ENV, like a host that never sets it.
        const { NODE_ENV: _unset, ...env } = process.env;
        const output = execFileSync(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `const { result } = await import(${JSON.stringify(pathToFileURL(bundlePath).href)}); console.log(JSON.stringify(result));`,
          ],
          { env, encoding: "utf8" },
        );
        expect(JSON.parse(output)).toEqual({ mode: "production", sep: "/" });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }, 30_000);
  });
});
