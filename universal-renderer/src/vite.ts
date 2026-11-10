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
   * client build's, or every server-rendered image 404s. Defaults to `/vite/`,
   * vite_ruby's default public output dir.
   */
  base?: string;

  /**
   * Extra `build` options, merged over the defaults. On Vite 8, pass bundler
   * options as `rolldownOptions` or `rollupOptions`; both are merged.
   */
  build?: SsrBuildConfig;
};

type BundlerOptions = NonNullable<NonNullable<UserConfig["build"]>["rollupOptions"]>;

// Vite 8 renamed `rollupOptions` to `rolldownOptions`. Typed here so the option
// type-checks against the Vite 5-7 types this package builds with.
type SsrBuildConfig = NonNullable<UserConfig["build"]> & {
  rolldownOptions?: BundlerOptions;
};

/**
 * Builds the Vite config for the SSR bundle.
 *
 * A Rails SSR build has six settings that are wrong by default and fail
 * silently: you get a bundle, it just renders the wrong thing, or none at all.
 *
 *   1. `vite-plugin-rails` must be left out. It targets the client manifest
 *      pipeline and overrides entrypoints and outDir. Pass only the plugins the
 *      render needs; this helper adds none.
 *   2. `base` must match the client build's public prefix.
 *   3. `publicDir` must be false, or the SSR build copies Rails' `public/` into
 *      its own output.
 *   4. `outDir` must sit outside `public/` and still survive
 *      `assets:precompile` into the deploy slug.
 *   5. `process.env.NODE_ENV` must be replaced at build time. Vite does this for
 *      client builds but leaves it to runtime in SSR builds, and most hosts never
 *      set it, so React and every other bundled library run their development
 *      builds in production: slower renders, and a warning with a component stack
 *      in the logs on every render. This uses the client builds' rule: the
 *      `NODE_ENV` the build runs with, or `"production"`.
 *   6. Dependencies must be bundled (`ssr.noExternal: true`). Vite externalizes
 *      `node_modules` in SSR builds, and deploys that prune `node_modules` after
 *      the build leave the renderer unable to resolve `react`, so it never binds
 *      its port. Node builtins stay external. List client-only packages that
 *      cannot be bundled (native modules such as `canvas`) in `ssr.external`,
 *      which takes priority.
 *
 * This config is for `vite build` only. The development renderer loads your
 * client `vite.config.*` and keeps development builds and their warnings.
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

  const { rollupOptions, rolldownOptions, ...buildRest } = build ?? {};

  // An array would be spread into an object below and become `{ "0": {...} }`,
  // losing the pinned entry filename. The SSR bundle is a single entry.
  if ([rollupOptions?.output, rolldownOptions?.output].some(Array.isArray)) {
    throw new Error(
      "defineSsrConfig does not support an array of bundler outputs; the SSR " +
        "bundle is a single entry. Pass a single output object.",
    );
  }

  // Pinned: Vite picks `.js` or `.mjs` depending on `"type": "module"`, and the
  // process supervisor has to name this file.
  const outputName = `${basename(entry).replace(/\.[cm]?[jt]sx?$/, "")}.mjs`;

  const bundlerOptions: BundlerOptions = {
    ...rollupOptions,
    ...rolldownOptions,
    output: {
      format: "esm",
      entryFileNames: outputName,
      ...(rollupOptions?.output as Record<string, unknown>),
      ...(rolldownOptions?.output as Record<string, unknown>),
    },
  };

  const buildConfig: SsrBuildConfig = {
    ssr: absolute(entry),
    outDir: absolute(outDir),
    emptyOutDir: true,
    target: "esnext",
    ...buildRest,
    // Vite 5-7 read `rollupOptions`. Vite 8 reads `rolldownOptions` and treats
    // `rollupOptions` as a deprecated alias, so both point at the same object.
    rollupOptions: bundlerOptions,
    rolldownOptions: bundlerOptions,
  };

  return {
    root,
    base,
    // Rails' public/ is this root's default publicDir.
    publicDir: false,
    ...rest,
    define: {
      // Browser-oriented modules reference `global`, which is not a bare
      // identifier in ESM.
      global: "globalThis",
      // Vite's rule for client builds: the NODE_ENV the build runs with, or
      // production. Without it, Vite leaves SSR code reading the host's
      // NODE_ENV, which a Rails deploy rarely sets.
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
      ...rest.define,
    },
    ssr: {
      noExternal: true,
      ...rest.ssr,
    },
    build: buildConfig,
  };
}
