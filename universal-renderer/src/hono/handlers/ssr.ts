import type { Context, Handler } from "hono";
// import { createSSRHandler as createCoreSSRHandler } from "../../core/handlers/ssr";
// import { adaptHandler } from "../adapters";
import type { RenderOutput } from "../../types"; // Added for RenderOutput type
import type { HonoSSRHandlerOptions } from "../types";

/**
 * Creates a Server-Side Rendering route handler for Hono.
 *
 * This handler expects POST requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head?: string, body: string, bodyAttrs?: string }`.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for SSR
 * @returns Hono route handler for SSR requests
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createSSRHandler } from 'universal-renderer/hono';
 * import { renderToString } from 'react-dom/server';
 *
 * const app = new Hono();
 *
 * app.post('/render', createSSRHandler({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   render: async (context) => ({
 *     body: renderToString(<App {...context} />)
 *   }),
 *   cleanup: (context) => context.store?.dispose()
 * }));
 * ```
 */
export function createSSRHandler<TContext extends Record<string, any>>(
  options: HonoSSRHandlerOptions<TContext>,
): Handler {
  // const coreHandler = createCoreSSRHandler(options);
  // return adaptHandler(coreHandler);
  if (!options.render) {
    throw new Error("render callback is required");
  }

  return async (c: Context) => {
    let context: TContext | undefined;

    try {
      const body = await c.req.json().catch(() => ({})); // Safely parse JSON
      const { url, props = {} } = body as { url?: string; props?: any };

      if (!url) {
        c.status(400);
        return c.json({ error: "URL is required" });
      }

      // Set up the rendering context with the provided URL and props
      context = await options.setup(url, props);

      // Render the application and get the HTML output
      const result: RenderOutput = await options.render(context);

      // Return the rendered content as JSON
      return c.json(result);
    } catch (error: any) {
      console.error("[SSR] Hono Render error:", error);
      // Use custom error handler if provided
      if (options.error) {
        return options.error(error, c);
      }
      c.status(500);
      return c.json({
        error: "Internal Server Error",
        message: error?.message,
      });
    } finally {
      // Always clean up resources, even if rendering failed
      if (context && options.cleanup) {
        await options.cleanup(context); // Ensure cleanup is awaited if it's async
      }
    }
  };
}
