import express from "express";
import type { Server } from "node:http";

import { createLimiter } from "../concurrency";
import { createErrorHandler } from "./handlers/error";
import { createHealthHandler } from "./handlers/health";
import { createSSRHandler } from "./handlers/ssr";
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

/**
 * Resolves the port from an explicit option, then `SSR_PORT`, then the default.
 * `SSR_PORT` is the documented convention on both sides: the gem's generated
 * initializer defaults `config.url` to `http://localhost:3001`.
 */
export function resolvePort(port?: number): number {
  if (typeof port === "number") return port;

  const fromEnv = Number(process.env.SSR_PORT);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_PORT;
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

  // One limiter shared by both handlers: a blocking render and a streaming
  // render contend for exactly the same module state.
  const limiter = createLimiter(options.concurrency ?? 1);

  // Basic middleware
  app.use(express.json({ limit: options.bodyLimit ?? "50mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Apply custom middleware before the built-in routes so authentication,
  // request decoration, and response headers affect SSR and health requests.
  if (options.middleware) {
    app.use(options.middleware);
  }

  // Health check endpoint using the health handler factory
  app.get(paths.health as string | string[], createHealthHandler());

  // JSON SSR endpoints using the SSR handler factory
  const ssrHandler = createSSRHandler({
    setup: options.setup,
    prepare: options.prepare,
    render: options.render,
    cleanup: options.cleanup,
    limiter,
  });
  app.post(paths.render as string | string[], ssrHandler);

  // Streaming SSR endpoint (if streaming is configured)
  if (options.streamCallbacks) {
    const streamHandler = createStreamHandler({
      setup: options.setup,
      prepare: options.prepare,
      cleanup: options.cleanup,
      streamCallbacks: options.streamCallbacks,
      error: options.error,
      limiter,
    });
    app.post(paths.stream as string | string[], streamHandler);
  }

  // Handle 404 - Not Found
  app.use((req, res, next) => {
    // Check if headers have already been sent, which means a response was already initiated.
    // If so, delegate to the next error handler.
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
 * Prefer this over calling `createServer(...)` then `app.listen(3001)`: it
 * resolves the port the same way the gem's generated initializer expects
 * (`SSR_PORT`, then 3001), binds loopback by default, and resolves only once the
 * socket is actually listening — which is what makes it usable from a process
 * supervisor that needs to know the renderer is up.
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
    const listening = app.listen(port, host, () => resolve(listening));
    listening.once("error", reject);
  });

  if (options.log !== false) {
    console.log(`[SSR] universal-renderer listening on http://${host}:${port}`);
  }

  return { app, server, port };
}
