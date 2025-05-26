import type {
  BaseHandlerOptions,
  SSRHandlerOptions as CoreSSRHandlerOptions,
  StreamHandlerOptions as CoreStreamHandlerOptions,
} from "../types";

/**
 * Bun-specific error handler function type.
 */
export type BunErrorHandler = (
  error: Error,
  request: Request,
) => Response | Promise<Response>;

/**
 * Bun-specific request handler function type.
 */
export type BunRequestHandler = (
  request: Request,
) => Response | Promise<Response>;

/**
 * Bun-specific base configuration for handlers.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type BunBaseHandlerOptions<TContext extends Record<string, any>> =
  BaseHandlerOptions<TContext> & {
    /**
     * Optional Bun error handler.
     */
    error?: BunErrorHandler;
  };

/**
 * Bun-specific configuration options for the SSR handler.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type BunSSRHandlerOptions<TContext extends Record<string, any>> =
  CoreSSRHandlerOptions<TContext> & {
    /**
     * Optional Bun error handler.
     */
    error?: BunErrorHandler;
  };

/**
 * Bun-specific configuration options for the streaming SSR handler.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type BunStreamHandlerOptions<TContext extends Record<string, any>> =
  CoreStreamHandlerOptions<TContext> & {
    /**
     * Optional Bun error handler.
     */
    error?: BunErrorHandler;
  };

/**
 * Bun-specific configuration options for creating an SSR server.
 * @template TContext - The type of context object passed between setup, render, and cleanup functions
 */
export type BunServerOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = BunSSRHandlerOptions<TContext> & {
  /**
   * Optional streaming callbacks for React 18+ streaming SSR.
   * When provided, enables the `/stream` endpoint for streaming responses.
   */
  streamCallbacks?: BunStreamHandlerOptions<TContext>["streamCallbacks"];
  /**
   * Port for the Bun server to listen on.
   * @default 3000
   */
  port?: number;

  /**
   * Optional Bun error handler to be applied to the server.
   */
  error?: BunErrorHandler;
};
