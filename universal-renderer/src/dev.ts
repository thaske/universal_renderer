import { isAbsolute, resolve } from "node:path";

import type { Server } from "node:http";
import type { Application, ErrorRequestHandler, RequestHandler } from "express";
import type { InlineConfig, ViteDevServer } from "vite";

import { startServer } from "./http/server";
import type { SsrConfig } from "./http/types";

/** Picks the ESM entry out of a package.json `exports` subpath value. */
function esmEntry(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;

  const conditions = value as Record<string, unknown>;
  for (const key of ["module-sync", "import", "default"]) {
    const entry = esmEntry(conditions[key]);
    if (entry) return entry;
  }
  return undefined;
}

/**
 * Loads Vite from the host application rather than from this package.
 *
 * A bare `import("vite")` resolves relative to *this* module, which lands on the
 * package's own copy whenever it is linked (`file:`, a workspace, a monorepo).
 * Two Vite instances then disagree about config and plugin state, and the symptom
 * is not an import error — it is path aliases failing to resolve mid-render.
 */
async function importHostVite(root: string) {
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const hostRequire = createRequire(resolve(root, "package.json"));

  const load = (path: string) =>
    import(pathToFileURL(path).href) as Promise<typeof import("vite")>;

  try {
    return await load(hostRequire.resolve("vite"));
  } catch {
    // `require.resolve` applies the `require` condition, and Vite 7 ships no CJS
    // entry, so this throws ERR_PACKAGE_PATH_NOT_EXPORTED on a version the
    // peer range allows. Fall through to the package's own declared ESM entry
    // rather than to a different copy of Vite.
  }

  try {
    const manifestPath = hostRequire.resolve("vite/package.json");
    const manifest = hostRequire(manifestPath) as {
      exports?: Record<string, unknown>;
      module?: string;
      main?: string;
    };
    const entry =
      esmEntry(manifest.exports?.["."]) ?? manifest.module ?? manifest.main;

    if (entry) return await load(join(dirname(manifestPath), entry));
  } catch {
    // Not resolvable from the host at all.
  }

  // Falling back to this package's own Vite works until the two disagree about
  // plugin state, and the symptom then is path aliases failing to resolve
  // mid-render rather than an import error. Say so once at boot instead of
  // leaving it to be discovered.
  console.warn(
    `[SSR] could not resolve Vite from ${root}; using the copy bundled with ` +
      "universal-renderer. Add vite to the app's own dependencies if renders " +
      "fail to resolve path aliases.",
  );
  return await import("vite");
}

/**
 * Runs `first`, then `second` if the response is still open.
 *
 * Exported for its own test rather than for use: composing the dev server's
 * middleware with the app's is easy to get subtly wrong, and starting a Vite
 * server to check it is not worth the cost.
 *
 * @internal
 */
export function composeMiddleware(
  first: RequestHandler,
  second?: RequestHandler,
): RequestHandler {
  if (!second) return first;

  return (req, res, next) => {
    first(req, res, (error?: unknown) => {
      if (error) return next(error);
      // Vite's stack answers some requests itself (module transforms, HMR). Only
      // reach the app's middleware when nothing has been sent.
      if (res.writableEnded || res.headersSent) return;
      second(req, res, next);
    });
  };
}

export type DevServerOptions = {
  /**
   * Module that default-exports the render config ({@link SsrConfig}),
   * relative to `root`. Conventionally `app/frontend/ssr/config.ts`.
   */
  entry: string;

  /** Project root — the Rails root. Defaults to `process.cwd()`. */
  root?: string;

  /** Defaults to `SSR_PORT`, then 3001. */
  port?: number;

  /** Defaults to `127.0.0.1`. */
  host?: string;

  /**
   * Vite config file to load. Defaults to Vite's own discovery, which finds the
   * client `vite.config.*` — that is usually what you want, since the render
   * needs the same plugins and path aliases the client build uses. Do NOT point
   * this at the SSR build config; that one exists to produce the production
   * bundle and deliberately omits the Rails plugin.
   */
  configFile?: string | false;

  /** Extra inline Vite config, merged over the middleware-mode defaults. */
  viteConfig?: InlineConfig;

  /**
   * Transport options merged over the loaded config — e.g. `concurrency` while
   * debugging.
   *
   * Deliberately not `Partial<SsrConfig>`: the lifecycle hooks and
   * `streamCallbacks` are re-resolved from the entry on every render, so an
   * override for those would be ignored, and a type that accepted them would
   * only advertise something that does not happen.
   *
   * `middleware` and `error` compose with the dev server's own rather than
   * replacing them: yours runs after Vite's stack, and after the handler that
   * maps stack traces back to source.
   */
  overrides?: Pick<
    SsrConfig,
    | "bodyLimit"
    | "concurrency"
    | "error"
    | "middleware"
    | "paths"
    | "queueLimit"
    | "renderTimeout"
  >;
};

/**
 * Starts the development renderer: your render config, loaded through Vite's SSR
 * transform.
 *
 * Development and production must not share an entry, and the reason is worth
 * stating plainly: a Vite dev server transforming modules per render is the
 * single largest cost in the SSR path. Production uses the prebuilt bundle
 * (`defineSsrConfig` + `startServer`). This exists so that in development the
 * app graph gets the same treatment the client dev server gives it — path
 * aliases, JSX, `.erb` modules, SVGR — with no rebuild between edits.
 *
 * The config module is re-resolved on every render rather than pinned at boot.
 * `ssrLoadModule` serves its cache until Vite invalidates it, so this is free
 * per request, but it means an edit is picked up *in full*. Pinning the module
 * would keep parts of the graph at their old version, and a stale copy of a
 * module-level singleton — the store, the query client — renders a page that
 * silently disagrees with the one the browser hydrates.
 *
 * All four lifecycle hooks for a given render come from the same reloaded
 * module, so a render can never mix versions mid-flight.
 *
 * @example
 * ```ts
 * // app/frontend/ssr/dev.ts
 * import "./globals";
 *
 * const { startDevServer } = await import("universal-renderer/dev");
 * await startDevServer({ entry: "app/frontend/ssr/config.ts" });
 * ```
 */
export async function startDevServer(options: DevServerOptions): Promise<{
  app: Application;
  server: Server;
  port: number;
  vite: ViteDevServer;
}> {
  const root = options.root ?? process.cwd();

  // vite-plugin-erb shells out to `bin/rails runner`, which has to run from the
  // Rails root for credentials to resolve. Under a process supervisor the cwd is
  // already the project root, so default it there.
  process.env.VITE_RUBY_ROOT ||= root;

  const { createServer: createViteServer } = await importHostVite(root);

  const vite = await createViteServer({
    root,
    appType: "custom",
    ...(options.configFile === undefined
      ? {}
      : { configFile: options.configFile }),
    ...options.viteConfig,
    server: { middlewareMode: true, ...options.viteConfig?.server },
  });

  const entryPath = isAbsolute(options.entry)
    ? options.entry
    : resolve(root, options.entry);

  const loadConfig = async (): Promise<SsrConfig> => {
    const module = await vite.ssrLoadModule(entryPath);
    const config = module.default as SsrConfig | undefined;

    if (!config || typeof config.setup !== "function") {
      throw new Error(
        `${options.entry} must default-export an SsrConfig with a setup function`,
      );
    }

    return config;
  };

  // Loaded once up front purely to fail fast on a broken entry and to learn
  // whether streaming is configured, which decides whether the stream route is
  // mounted at all.
  const initial = await loadConfig();

  // Keyed by the context object rather than stashed on it: spreading a property
  // into the context would flatten class instances the render depends on.
  const configs = new WeakMap<object, SsrConfig>();

  const configFor = (context: object): SsrConfig => {
    const config = configs.get(context);
    if (!config) {
      throw new Error(
        "No render config recorded for this context — did setup return a non-object?",
      );
    }
    return config;
  };

  const fixStacktrace: ErrorRequestHandler = (error, req, res, next) => {
    if (error instanceof Error) vite.ssrFixStacktrace(error);
    // `overrides` wins over the loaded config, the same way it does for every
    // other option below.
    const downstream = options.overrides?.error ?? initial.error;
    if (downstream) return downstream(error, req, res, next);
    return next(error);
  };

  const streamCallbacks = initial.streamCallbacks
    ? {
        node: (context: any) =>
          configFor(context).streamCallbacks?.node?.(context),
        head: (context: any) =>
          configFor(context).streamCallbacks?.head?.(context) ?? "",
        // Delegated like the others — gating on the boot-time config would
        // miss an edit that adds or removes the transform until restart.
        transform: (context: any) =>
          configFor(context).streamCallbacks?.transform?.(context),
      }
    : undefined;

  const started = await startServer({
    concurrency: initial.concurrency,
    queueLimit: initial.queueLimit,
    paths: initial.paths,
    bodyLimit: initial.bodyLimit,
    // Off by default in development: a breakpoint in the render, or the first
    // request paying for the module transform of the whole app graph, routinely
    // outlasts the production budget, and a 504 there is noise rather than
    // signal. Override it explicitly to exercise the production behaviour.
    renderTimeout: initial.renderTimeout ?? false,
    ...options.overrides,

    port: options.port,
    host: options.host,
    // Composed rather than replaced. The Vite middleware stack is what makes
    // this a dev server, so it has to run, but an override that was accepted and
    // then dropped is worse than one that is refused. Same for the error
    // handler: `fixStacktrace` maps traces back to source and then delegates.
    middleware: composeMiddleware(
      vite.middlewares as unknown as RequestHandler,
      options.overrides?.middleware,
    ) as never,
    error: fixStacktrace,

    setup: async (url, props) => {
      const config = await loadConfig();
      const context = await config.setup(url, props);
      configs.set(context, config);
      return context;
    },
    prepare: (context) => configFor(context).prepare?.(context),
    render: (context) => configFor(context).render(context),
    cleanup: async (context) => {
      const config = configs.get(context);
      try {
        await config?.cleanup?.(context);
      } finally {
        configs.delete(context);
      }
    },

    streamCallbacks: streamCallbacks as SsrConfig["streamCallbacks"],
  });

  return { ...started, vite };
}
