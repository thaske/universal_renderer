import express from "express";

import { createErrorHandler } from "./handlers/error";
import { createHealthHandler } from "./handlers/health";
import { createSSRHandler } from "./handlers/ssr";
import { createStreamHandler } from "./handlers/stream";

import type { ExpressServerOptions } from "./types";

export type { RenderOutput } from "../types";
export type { ExpressServerOptions };

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
 * import { createServer } from 'universal-renderer/express';
 *
 * const app = await createServer({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   render: async (context) => ({ body: renderToString(<App {...context} />) }),
 *   cleanup: (context) => context.store?.dispose()
 * });
 *
 * // Option 2: Individual handlers for more control
 * import { createHealthHandler, createSSRHandler } from 'universal-renderer/express';
 *
 * const app = express();
 * app.use(express.json());
 * app.get('/health', createHealthHandler());
 * app.post('/render', createSSRHandler(options));
 * ```
 */
export async function createServer<
  TContext extends Record<string, any> = Record<string, any>,
>(options: ExpressServerOptions<TContext>): Promise<express.Application> {
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
      error: options.error,
    });
    app.post("/stream", streamHandler);
  }

  // Custom middleware
  if (options.middleware) {
    app.use(options.middleware);
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
