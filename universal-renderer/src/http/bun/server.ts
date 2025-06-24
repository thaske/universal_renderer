import { createErrorHandler } from "./handlers/error";
import { createHealthHandler } from "./handlers/health";
import { createSSRHandler } from "./handlers/ssr";
import { createStreamHandler } from "./handlers/stream";
import type { BunServerOptions } from "./types";

export type { RenderOutput } from "../../types";

/**
 * Creates a Bun server configured for Server-Side Rendering (SSR).
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
 * @returns Promise that resolves to an object with a `fetch` method and a `port` for `Bun.serve`
 *
 * @example
 * ```typescript
 * import { createServer } from 'universal-renderer/bun';
 *
 * const server = await createServer({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   render: async (context) => ({ body: renderToString(<App {...context} />) }),
 *   cleanup: (context) => context.store?.dispose()
 * });
 *
 * Bun.serve(server);
 * ```
 */
export async function createServer<
  TContext extends Record<string, any> = Record<string, any>,
>(
  options: BunServerOptions<TContext>,
): Promise<{
  fetch: (request: Request) => Promise<Response> | Response;
  port: number;
}> {
  if (!options.render) {
    throw new Error("render callback is required");
  }

  // Placeholder for Bun's routing/request handling.
  // This will need to be adapted to Bun's native Request/Response objects
  // and routing capabilities. For now, we'll simulate a simple router.

  const healthHandler = createHealthHandler();
  const ssrHandler = createSSRHandler({
    setup: options.setup,
    render: options.render,
    cleanup: options.cleanup,
    error: options.error,
  });

  let streamHandler:
    | ((req: Request) => Promise<Response> | Response)
    | undefined;
  if (options.streamCallbacks) {
    streamHandler = createStreamHandler({
      setup: options.setup,
      cleanup: options.cleanup,
      streamCallbacks: options.streamCallbacks,
      error: options.error,
    });
  }

  const errorHandler = options.error || createErrorHandler();

  const fetch = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return healthHandler(request);
      }
      if (
        request.method === "POST" &&
        (url.pathname === "/" || url.pathname === "/static")
      ) {
        return ssrHandler(request);
      }
      if (
        request.method === "POST" &&
        url.pathname === "/stream" &&
        streamHandler
      ) {
        return streamHandler(request);
      }
      return new Response("Not Found", { status: 404 });
    } catch (e: any) {
      return errorHandler(e, request);
    }
  };

  return {
    fetch,
    port: options.port || 3000, // Default port or from options
  };
}
