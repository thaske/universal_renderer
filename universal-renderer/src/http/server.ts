import express from "express";
import type { Server } from "node:http";

import { createLimiter } from "../concurrency";
import { createErrorHandler } from "./handlers/error";
import { createHealthHandler } from "./handlers/health";
import { createSSRHandler, DEFAULT_RENDER_TIMEOUT_MS } from "./handlers/ssr";
import { createStreamHandler } from "./handlers/stream";

import type { ExpressServerOptions } from "./types";

export type { RenderOutput } from "../types";
export type { ExpressServerOptions };

const DEFAULT_PATHS = {
  render: ["/", "/static"],
  stream: "/stream",
  health: "/health",
} as const;

/** Port the renderer listens on when nothing else is specified. */
export const DEFAULT_PORT = 3001;

const isUsablePort = (value: number) =>
  Number.isInteger(value) && value >= 0 && value <= 65535;

/**
 * Resolves the port from an explicit option, then `SSR_PORT`, then the default.
 * Validated here, because `listen` rejects a bad port with an opaque error at
 * boot, long after the typo.
 */
export function resolvePort(port?: number): number {
  if (typeof port === "number") {
    if (!isUsablePort(port)) {
      throw new Error(
        `port must be an integer between 0 and 65535, got ${String(port)}`,
      );
    }
    return port;
  }

  const raw = process.env.SSR_PORT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;

  const fromEnv = Number(raw);
  if (!isUsablePort(fromEnv) || fromEnv === 0) {
    throw new Error(
      `SSR_PORT must be an integer between 1 and 65535, got ${JSON.stringify(raw)}`,
    );
  }

  return fromEnv;
}

/**
 * Creates an Express server configured for Server-Side Rendering (SSR).
 *
 * Endpoints (all overridable via `paths`):
 * - `GET /health` - Health check
 * - `POST /` and `POST /static` - JSON-based SSR rendering
 * - `POST /stream` - Streaming SSR (only when `streamCallbacks` is provided)
 *
 * Renders are serialized by default (`concurrency: 1`) because a client-first
 * app's module-level state is not safe to interleave. See {@link createLimiter}.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for the SSR server
 * @returns Promise that resolves to a configured Express application
 *
 * @example
 * ```typescript
 * import { createServer } from 'universal-renderer';
 *
 * const app = await createServer({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   prepare: (context) => seedGlobals(context),
 *   render: async (context) => ({ body: renderToString(context.app) }),
 *   cleanup: (context) => context.store?.dispose()
 * });
 * app.listen(3001);
 * ```
 *
 * @example
 * ```typescript
 * // Or let startServer handle the port convention for you:
 * import { startServer } from 'universal-renderer';
 * await startServer(config);
 * ```
 */
export async function createServer<
  TContext extends Record<string, any> = Record<string, any>,
>(options: ExpressServerOptions<TContext>): Promise<express.Application> {
  if (!options.render) {
    throw new Error("render callback is required");
  }

  const app = express();
  const paths = { ...DEFAULT_PATHS, ...options.paths };

  // One limiter for both handlers: they contend for the same module state.
  const limiter = createLimiter(options.concurrency ?? 1, options.queueLimit);
  const renderTimeout = options.renderTimeout ?? DEFAULT_RENDER_TIMEOUT_MS;

  // Basic middleware
  app.use(express.json({ limit: options.bodyLimit ?? "50mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Before the built-in routes, so it affects SSR and health requests too.
  if (options.middleware) {
    app.use(options.middleware);
  }

  // Reports the limiter, so a supervisor can tell a busy renderer from a wedged
  // one. Only a restart clears the latter.
  app.get(
    paths.health as string | string[],
    createHealthHandler({ limiter, stallAfterMs: options.stallAfterMs }),
  );

  // JSON SSR endpoints using the SSR handler factory
  const ssrHandler = createSSRHandler({
    setup: options.setup,
    prepare: options.prepare,
    render: options.render,
    cleanup: options.cleanup,
    limiter,
    renderTimeout,
  });
  app.post(paths.render as string | string[], ssrHandler);

  // Streaming SSR endpoint (if streaming is configured)
  if (options.streamCallbacks) {
    const streamHandler = createStreamHandler({
      setup: options.setup,
      prepare: options.prepare,
      cleanup: options.cleanup,
      streamCallbacks: options.streamCallbacks,
      limiter,
      renderTimeout,
    });
    app.post(paths.stream as string | string[], streamHandler);
  }

  app.use((req, res, next) => {
    if (res.headersSent) {
      return next();
    }
    res.status(404).json({ error: "Not Found" });
  });

  // Error handler
  if (options.error) {
    app.use(options.error);
  } else {
    app.use(createErrorHandler());
  }

  return app;
}

/**
 * Creates the SSR server and starts listening.
 *
 * Prefer this over `createServer(...)` then `app.listen(3001)`: it resolves the
 * port the way the generated initializer expects, binds loopback, and resolves
 * only once the socket is listening, which a process supervisor needs.
 *
 * @returns The Express app, the Node server, and the port it bound.
 */
export async function startServer<
  TContext extends Record<string, any> = Record<string, any>,
>(
  options: ExpressServerOptions<TContext> & {
    /** Defaults to `SSR_PORT`, then 3001. */
    port?: number;
    /** Defaults to `127.0.0.1`. The renderer is not meant to face the internet. */
    host?: string;
    /** Set false to skip the startup log line. */
    log?: boolean;
  },
): Promise<{ app: express.Application; server: Server; port: number }> {
  const app = await createServer(options);
  const port = resolvePort(options.port);
  const host = options.host ?? "127.0.0.1";

  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(port, host, () => {
      // Drop the rejection listener, so a later server 'error' surfaces instead
      // of being swallowed by an already-settled promise.
      listening.removeListener("error", reject);
      resolve(listening);
    });
    listening.once("error", reject);
  });

  if (options.log !== false) {
    console.log(`[SSR] universal-renderer listening on http://${host}:${port}`);
  }

  return { app, server, port };
}
