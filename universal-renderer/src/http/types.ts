import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import type { Concurrency } from "../concurrency";
import type {
  BaseHandlerOptions,
  ServerPaths,
  SSRHandlerOptions as CoreSSRHandlerOptions,
  StreamHandlerOptions as CoreStreamHandlerOptions,
} from "../types";

/**
 * Express-specific base configuration for handlers.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type ExpressBaseHandlerOptions<TContext extends Record<string, any>> =
  BaseHandlerOptions<TContext> & {
    /**
     * Optional Express error handler to be applied to the server.
     * This error handler will be applied after the built-in middleware but before the error handler.
     */
    error?: ErrorRequestHandler;
  };

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
  CoreSSRHandlerOptions<TContext> & {
    /**
     * Optional Express error handler.
     */
    error?: ErrorRequestHandler;
  };

/**
 * Express-specific configuration options for the streaming SSR handler.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type ExpressStreamHandlerOptions<TContext extends Record<string, any>> =
  CoreStreamHandlerOptions<TContext> & {
    /**
     * Optional Express error handler.
     */
    error?: ErrorRequestHandler;
  };

/**
 * Express-specific configuration options for creating an SSR server.
 * @template TContext - The type of context object passed between setup, render, and cleanup functions
 */
export type ExpressServerOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = ExpressSSRHandlerOptions<TContext> & {
  /**
   * Optional streaming callbacks for React 18+ streaming SSR.
   * When provided, enables the `/stream` endpoint for streaming responses.
   */
  streamCallbacks?: ExpressStreamHandlerOptions<TContext>["streamCallbacks"];

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
