import { basename, isAbsolute, resolve } from "node:path";

// Type-only, so this module adds no runtime dependency on Vite. It is imported
// from a Vite config, where Vite is present by definition.
import type { UserConfig } from "vite";

export type SsrBuildOptions = Omit<UserConfig, "build"> & {
  /**
   * SSR entry module, relative to `root`. This is the production entry — the
   * one that calls `startServer`, not the render config.
   */
  entry: string;

  /** Project root. Defaults to `process.cwd()`. */
  root?: string;

  /**
   * Where the bundle is written. Defaults to `ssr-build`, deliberately outside
   * `public/`: this is server code and must not be web-servable.
   */
  outDir?: string;

  /**
   * Public path prefix for asset URLs the *server* render emits. Must match the
   * client build's, or SSR produces `/assets/x.png` while Rails serves the
   * fingerprinted file at `/vite/assets/x.png` and every server-rendered image
   * 404s. Defaults to `/vite/`, vite_ruby's default public output dir.
   */
  base?: string;

  /** Extra `build` options, merged over the defaults. */
  build?: UserConfig["build"];
};

/**
 * Builds the Vite config for the SSR bundle.
 *
 * This exists because a Rails SSR build has four settings that are each wrong by
 * default and each fail *silently* — you get a bundle, it just renders the wrong
 * thing:
 *
 *   1. `vite-plugin-rails` must be left out. It is built for the client manifest
 *      pipeline and overrides entrypoints and outDir. Pass only the plugins the
 *      render itself needs (react, svgr, your ERB plugin) — this helper does not
 *      add any.
 *   2. `base` must match the client build's public prefix (see above).
 *   3. `publicDir` must be false. Rails' `public/` is this root's default
 *      publicDir, so otherwise the SSR build copies the whole directory into its
 *      own output.
 *   4. `outDir` must sit outside `public/` but still survive
 *      `assets:precompile` into the deploy slug. A plain project-root directory
 *      does both.
 *
 * @example
 * ```ts
 * // vite.config.ssr.mts
 * import react from "@vitejs/plugin-react";
 * import { defineSsrConfig } from "universal-renderer/vite";
 *
 * export default defineSsrConfig({
 *   entry: "app/frontend/ssr/server.ts",
 *   plugins: [react()],
 * });
 * ```
 */
export function defineSsrConfig(options: SsrBuildOptions): UserConfig {
  const {
    entry,
    root = process.cwd(),
    outDir = "ssr-build",
    base = "/vite/",
    build,
    ...rest
  } = options;

  const absolute = (path: string) =>
    isAbsolute(path) ? path : resolve(root, path);

  // An array of outputs would be spread into an object below and silently
  // become `{ "0": {...} }`, losing the pinned entry filename with it. The SSR
  // bundle is a single entry, so there is nothing to support here — say so.
  if (Array.isArray(build?.rollupOptions?.output)) {
    throw new Error(
      "defineSsrConfig does not support an array of rollup outputs; the SSR " +
        "bundle is a single entry. Pass a single output object.",
    );
  }

  // Pinned rather than left to Vite, which picks `.js` or `.mjs` depending on
  // whether package.json declares `"type": "module"`. The process supervisor has
  // to name this file, so it must not change under you.
  const outputName = `${basename(entry).replace(/\.[cm]?[jt]sx?$/, "")}.mjs`;

  return {
    root,
    base,
    // Rails' public/ is this root's default publicDir.
    publicDir: false,
    ...rest,
    define: {
      // Bundled browser-oriented modules reference `global`; under Node/Bun it
      // does not exist as a bare identifier in ESM.
      global: "globalThis",
      ...rest.define,
    },
    build: {
      ssr: absolute(entry),
      outDir: absolute(outDir),
      emptyOutDir: true,
      target: "esnext",
      ...build,
      rollupOptions: {
        ...build?.rollupOptions,
        output: {
          format: "esm",
          entryFileNames: outputName,
          ...(build?.rollupOptions?.output as Record<string, unknown>),
        },
      },
    },
  };
}
