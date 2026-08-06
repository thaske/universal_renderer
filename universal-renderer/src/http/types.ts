import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import type { Concurrency, QueueLimit } from "../concurrency";
import type {
  BaseHandlerOptions,
  ServerPaths,
  SSRHandlerOptions as CoreSSRHandlerOptions,
  StreamHandlerOptions as CoreStreamHandlerOptions,
} from "../types";

/**
 * Express-specific base configuration for handlers.
 *
 * Error handling is a server-level concern, not a handler-level one: the
 * handlers call `next(error)` and Express routes it to whatever is mounted
 * last. Pass `error` to `createServer` (see {@link ExpressServerOptions}).
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type ExpressBaseHandlerOptions<TContext extends Record<string, any>> =
  BaseHandlerOptions<TContext>;

/**
 * Defines the shape of an Express error handling function, compatible with Express's
 * error handling middleware signature.
 *
 * @param err - The error object.
 * @param req - The Express request object.
 * @param res - The Express response object.
 * @param next - The next middleware function in the stack.
 */
export type ExpressErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => void;

/**
 * Express-specific configuration options for the SSR handler.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type ExpressSSRHandlerOptions<TContext extends Record<string, any>> =
  CoreSSRHandlerOptions<TContext>;

/**
 * Express-specific configuration options for the streaming SSR handler.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type ExpressStreamHandlerOptions<TContext extends Record<string, any>> =
  CoreStreamHandlerOptions<TContext>;

/**
 * Express-specific configuration options for creating an SSR server.
 * @template TContext - The type of context object passed between setup, render, and cleanup functions
 */
export type ExpressServerOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = ExpressSSRHandlerOptions<TContext> & {
  /**
   * Optional Express error handler, mounted last. Replaces the built-in JSON
   * error handler.
   */
  error?: ErrorRequestHandler;

  /**
   * Optional streaming callbacks for React 18+ streaming SSR.
   * When provided, enables the `/stream` endpoint for streaming responses.
   */
  streamCallbacks?: ExpressStreamHandlerOptions<TContext>["streamCallbacks"];

  /**
   * How long a render may take before the request is answered `504`, in
   * milliseconds. Defaults to 10000; `false` disables it.
   *
   * This is what keeps a bounded `concurrency` from being a single point of
   * failure. A running render's slot is never revoked — it is still touching
   * module state, and handing that slot on is the interleaving `concurrency`
   * exists to prevent — so a render that never settles holds its slot forever
   * and, at `concurrency: 1`, the renderer is finished. The timeout frees the
   * *caller*; `/health` then reports 503 so a supervisor can restart the
   * process, which is the only thing that actually clears it. The generated
   * `bin/web` does exactly that.
   */
  renderTimeout?: number | false;

  /**
   * How many renders may be in flight at once. Defaults to `1`.
   *
   * Serialized is the safe default: an app retrofitted with SSR usually keeps
   * request state in module-level singletons, and interleaving renders through
   * those leaks one visitor's data into another's HTML. Scale out with more
   * renderer processes, and only raise this once you have verified the render
   * touches no shared mutable state. `"unbounded"` removes the limit.
   */
  concurrency?: Concurrency;

  /**
   * Maximum requests waiting for a render slot. Defaults to ten per slot.
   * Once full, new requests receive 503 rather than growing an unbounded stale
   * backlog. `"unbounded"` restores the old behavior.
   */
  queueLimit?: QueueLimit;

  /**
   * Paths to mount the endpoints at. Must agree with the gem's
   * `config.render_path` / `config.stream_path`.
   */
  paths?: ServerPaths;

  /**
   * Body size limit for `express.json`. Defaults to `"50mb"` — props carrying a
   * serialized query cache get large.
   */
  bodyLimit?: string;

  /**
   * Optional Express middleware to be applied to the server.
   * This middleware runs after request parsing and before the built-in health and SSR routes.
   *
   * @example
   * ```typescript
   * middleware: (req, res, next) => {
   *   // Add custom headers, authentication, etc.
   *   res.setHeader('X-Custom-Header', 'value');
   *   next();
   * }
   * ```
   */
  middleware?: RequestHandler;
};

/**
 * The complete render configuration for an app: everything `createServer` needs
 * except transport concerns.
 *
 * Keep this in one module that default-exports it (`app/frontend/ssr/config.ts`
 * by convention). The production entry passes it to `startServer`; the dev
 * entry hands the *path* to `startDevServer`, which reloads the module through
 * Vite on every render so edits to any part of the render take effect without a
 * rebuild.
 */
export type SsrConfig<
  TContext extends Record<string, any> = Record<string, any>,
> = ExpressServerOptions<TContext>;
