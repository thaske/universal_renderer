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
 * Error handling is server-level, not handler-level: handlers call
 * `next(error)`. Pass `error` to `createServer`.
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
   * A running render's slot is never revoked, since it is still touching module
   * state, so a render that never settles ends the renderer at `concurrency: 1`.
   * This frees the caller only; `/health` then reports 503 so a supervisor can
   * restart the process, which is the only thing that clears it.
   *
   * Keep the gem's `config.timeout` above this value. The defaults do not line
   * up (3s against 10s), so Rails gives up while the render keeps its slot.
   */
  renderTimeout?: number | false;

  /**
   * How many renders may be in flight at once. Defaults to `1`.
   *
   * Serialized by default, because an app retrofitted with SSR keeps request
   * state in module-level singletons, and interleaving renders through those
   * leak one visitor's data into another's HTML. Scale out with more renderer
   * processes. `"unbounded"` removes the limit.
   */
  concurrency?: Concurrency;

  /**
   * Maximum requests waiting for a render slot. Defaults to ten per slot; once
   * full, new requests receive 503. `"unbounded"` removes the limit.
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
 * Keep it in one module that default-exports it (`app/frontend/ssr/config.ts` by
 * convention). The production entry passes it to `startServer`; the dev entry
 * hands the *path* to `startDevServer`, which reloads it per render.
 */
export type SsrConfig<
  TContext extends Record<string, any> = Record<string, any>,
> = ExpressServerOptions<TContext>;
