import type { ErrorRequestHandler, RequestHandler } from "express";
import type {
  BaseHandlerOptions,
  SSRHandlerOptions as CoreSSRHandlerOptions,
  StreamHandlerOptions as CoreStreamHandlerOptions,
} from "../core/types";

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
   * Optional Express middleware to be applied to the server.
   * This middleware will be applied after the built-in middleware but before the error handler.
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
