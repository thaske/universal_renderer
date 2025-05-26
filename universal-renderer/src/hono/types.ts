import type { ErrorHandler, MiddlewareHandler } from "hono";
import type {
  BaseHandlerOptions,
  SSRHandlerOptions as CoreSSRHandlerOptions,
  StreamHandlerOptions as CoreStreamHandlerOptions,
} from "../core/types";

/**
 * Hono-specific base configuration for handlers.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type HonoBaseHandlerOptions<TContext extends Record<string, any>> =
  BaseHandlerOptions<TContext> & {
    /**
     * Optional Hono error handler to be applied to the server.
     * This error handler will be applied after the built-in middleware but before the error handler.
     */
    error?: ErrorHandler;
  };

/**
 * Hono-specific configuration options for the SSR handler.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type HonoSSRHandlerOptions<TContext extends Record<string, any>> =
  CoreSSRHandlerOptions<TContext> & {
    /**
     * Optional Hono error handler.
     */
    error?: ErrorHandler;
  };

/**
 * Hono-specific configuration options for the streaming SSR handler.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type HonoStreamHandlerOptions<TContext extends Record<string, any>> =
  CoreStreamHandlerOptions<TContext> & {
    /**
     * Optional Hono error handler.
     */
    error?: ErrorHandler;
  };

/**
 * Hono-specific configuration options for creating an SSR server.
 * @template TContext - The type of context object passed between setup, render, and cleanup functions
 */
export type HonoServerOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = HonoSSRHandlerOptions<TContext> & {
  /**
   * Optional streaming callbacks for React 18+ streaming SSR.
   * When provided, enables the `/stream` endpoint for streaming responses.
   */
  streamCallbacks?: HonoStreamHandlerOptions<TContext>["streamCallbacks"];

  /**
   * Optional Hono middleware to be applied to the server.
   * This middleware will be applied after the built-in middleware but before the error handler.
   *
   * @example
   * ```typescript
   * middleware: async (c, next) => {
   *   // Add custom headers, authentication, etc.
   *   c.header('X-Custom-Header', 'value');
   *   await next();
   * }
   * ```
   */
  middleware?: MiddlewareHandler;
};
