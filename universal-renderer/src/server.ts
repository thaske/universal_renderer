import express from "express";

import {
  createErrorHandler,
  createHealthHandler,
  createSSRHandler,
  createStreamHandler,
} from "@/handlers";
import type { ServerOptions } from "@/types";
export type { RenderOutput, ServerOptions } from "@/types";

/**
 * Creates an Express server configured for Server-Side Rendering (SSR).
 *
 * This function sets up a complete SSR server with the following endpoints:
 * - `GET /health` - Health check endpoint
 * - `POST /` and `POST /static` - JSON-based SSR rendering
 * - `POST /stream` - Streaming SSR (if streamCallbacks provided)
 *
 * For more flexibility, consider using the individual handler factories:
 * - `createHealthHandler()` for health checks
 * - `createSSRHandler(options)` for JSON-based SSR
 * - `createStreamHandler(options)` for streaming SSR
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for the SSR server
 * @returns Promise that resolves to a configured Express application
 *
 * @example
 * ```typescript
 * // Option 1: Complete server (this function)
 * import { createServer } from 'universal-renderer';
 *
 * const app = await createServer({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   render: async (context) => ({ body: renderToString(<App {...context} />) }),
 *   cleanup: (context) => context.store?.dispose()
 * });
 *
 * // Option 2: Individual handlers for more control
 * import { createHealthHandler, createSSRHandler } from 'universal-renderer';
 *
 * const app = express();
 * app.use(express.json());
 * app.get('/health', createHealthHandler());
 * app.post('/render', createSSRHandler(options));
 * ```
 */
export async function createServer<
  TContext extends Record<string, any> = Record<string, any>,
>(options: ServerOptions<TContext>): Promise<express.Application> {
  if (!options.render) {
    throw new Error("render callback is required");
  }

  const app = express();

  // Basic middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint using the health handler factory
  app.get("/health", createHealthHandler());

  // JSON SSR endpoints using the SSR handler factory
  const ssrHandler = createSSRHandler({
    setup: options.setup,
    render: options.render,
    cleanup: options.cleanup,
  });
  app.post(["/", "/static"], ssrHandler);

  // Streaming SSR endpoint (if streaming is configured)
  if (options.streamCallbacks) {
    const streamHandler = createStreamHandler({
      setup: options.setup,
      cleanup: options.cleanup,
      streamCallbacks: options.streamCallbacks,
    });
    app.post("/stream", streamHandler);
  }

  // Custom middleware
  if (options.middleware) {
    app.use(options.middleware);
  }

  // Error handler
  if (options.errorHandler) {
    app.use(options.errorHandler);
  } else {
    app.use(createErrorHandler());
  }

  return app;
}
