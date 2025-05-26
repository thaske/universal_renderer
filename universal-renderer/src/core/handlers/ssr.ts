import type { RequestInfo, ResponseUtils, SSRHandlerOptions } from "../types";

/**
 * Creates a framework-agnostic Server-Side Rendering handler for JSON-based SSR.
 *
 * This handler expects requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head?: string, body: string, bodyAttrs?: string }`.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for SSR
 * @returns Framework-agnostic handler for SSR requests
 *
 * @example
 * ```typescript
 * import { createSSRHandler } from 'universal-renderer/core';
 * import { renderToString } from 'react-dom/server';
 *
 * const ssrHandler = createSSRHandler({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   render: async (context) => ({
 *     body: renderToString(<App {...context} />)
 *   }),
 *   cleanup: (context) => context.store?.dispose()
 * });
 * ```
 */
export function createSSRHandler<TContext extends Record<string, any>>(
  options: SSRHandlerOptions<TContext>,
) {
  if (!options.render) {
    throw new Error("render callback is required");
  }

  return async (req: RequestInfo, res: ResponseUtils) => {
    let context: TContext | undefined;

    try {
      const { url, props = {} } = req.body;

      if (!url) {
        return res.json({ error: "URL is required" }, 400);
      }

      // Set up the rendering context with the provided URL and props
      context = await options.setup(url, props);

      // Render the application and get the HTML output
      const result = await options.render(context);

      // Return the rendered content as JSON
      res.json(result);
    } catch (error) {
      console.error("[SSR] Render error:", error);
      res.json({ error: "Internal Server Error" }, 500);
    } finally {
      // Always clean up resources, even if rendering failed
      if (context && options.cleanup) {
        options.cleanup(context);
      }
    }
  };
}
