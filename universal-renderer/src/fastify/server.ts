import type {
  FastifyServerOptions as FastifyFrameworkServerOptions,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fastify from "fastify";

import type { RenderOutput, SSRHandlerOptions } from "../types";
import {
  createErrorHandler,
  createHealthHandler,
  createSSRHandler,
  createStreamHandler,
} from "./handlers";
import type { FastifyStreamHandlerOptions } from "./types"; // Assuming this will be created

export type { RenderOutput };

/**
 * Configuration options for creating a Fastify SSR server.
 * @template TContext - The type of context object passed between setup, render, and cleanup functions
 */
export interface FastifyServerOptions<TContext extends Record<string, any>>
  extends SSRHandlerOptions<TContext> {
  /**
   * Optional streaming callbacks for React 18+ streaming SSR.
   * When provided, enables the `/stream` endpoint for streaming responses.
   */
  streamCallbacks?: FastifyStreamHandlerOptions<TContext>["streamCallbacks"];
  /**
   * Optional Fastify server options.
   */
  fastifyOptions?: FastifyFrameworkServerOptions;
  /**
   * Optional Fastify error handler specific to the server instance.
   * If not provided, a default one is created.
   */
  errorHandler?: (
    error: Error,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => void | Promise<void>;
}

/**
 * Creates a Fastify server configured for Server-Side Rendering (SSR).
 *
 * This function sets up a complete SSR server with the following endpoints:
 * - `GET /health` - Health check endpoint
 * - `POST /` and `POST /static` - JSON-based SSR rendering
 * - `POST /stream` - Streaming SSR (if streamCallbacks provided)
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for the SSR server
 * @returns Promise that resolves to a configured Fastify instance
 *
 * @example
 * \`\`\`typescript
 * import { createServer } from 'universal-renderer/fastify';
 *
 * const app = await createServer({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   render: async (context) => ({ body: renderToString(<App {...context} />) }),
 *   cleanup: (context) => context.store?.dispose()
 * });
 *
 * app.listen({ port: 3000 });
 * \`\`\`
 */
export async function createServer<
  TContext extends Record<string, any> = Record<string, any>,
>(options: FastifyServerOptions<TContext>): Promise<FastifyInstance> {
  if (!options.render) {
    throw new Error("render callback is required");
  }

  const app = fastify(options.fastifyOptions);

  // Health check endpoint
  app.get("/health", createHealthHandler());

  // JSON SSR endpoints
  const ssrHandler = createSSRHandler({
    setup: options.setup,
    render: options.render,
    cleanup: options.cleanup,
    // error: options.errorHandler, // Pass server-level error handler if defined for SSR part
  });
  app.post("/", ssrHandler);
  app.post("/static", ssrHandler);

  // Streaming SSR endpoint (if streaming is configured)
  if (options.streamCallbacks) {
    const streamHandler = createStreamHandler({
      setup: options.setup,
      cleanup: options.cleanup,
      streamCallbacks: options.streamCallbacks,
      error: options.errorHandler, // Pass server-level error handler for stream part
    });
    app.post("/stream", streamHandler);
  }

  // Set error handler
  if (options.errorHandler) {
    app.setErrorHandler(options.errorHandler);
  } else {
    app.setErrorHandler(createErrorHandler());
  }

  return app;
}
