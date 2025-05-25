import type { RenderOutput } from "@/server";
import type { RequestHandler } from "express";

/**
 * Configuration options for the SSR handler.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type SSRHandlerOptions<TContext = any> = {
  /**
   * Setup function called before rendering to prepare the context.
   * @param url - The URL being rendered
   * @param props - Additional props passed from the client
   * @returns Context object that will be passed to render and cleanup functions
   */
  setup: (url: string, props: any) => Promise<TContext> | TContext;

  /**
   * Main render function that produces the SSR output.
   * @param context - The context object returned by the setup function
   * @returns The rendered output containing head, body, and optional body attributes
   */
  render: (context: TContext) => Promise<RenderOutput> | RenderOutput;

  /**
   * Optional cleanup function called after rendering is complete.
   * @param context - The context object returned by the setup function
   */
  cleanup?: (context: TContext) => void;
};

/**
 * Creates a Server-Side Rendering route handler for JSON-based SSR.
 *
 * This handler expects POST requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head?: string, body: string, bodyAttrs?: string }`.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for SSR
 * @returns Express route handler for SSR requests
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createSSRHandler } from 'universal-renderer';
 * import { renderToString } from 'react-dom/server';
 *
 * const app = express();
 * app.use(express.json());
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
export function createSSRHandler<TContext = any>(
  options: SSRHandlerOptions<TContext>,
): RequestHandler {
  if (!options.render) {
    throw new Error("render callback is required");
  }

  return async (req, res) => {
    let context: TContext | undefined;

    try {
      const { url, props = {} } = req.body;

      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // Set up the rendering context with the provided URL and props
      context = await options.setup(url, props);

      // Render the application and get the HTML output
      const result = await options.render(context);

      // Return the rendered content as JSON
      res.json(result);
    } catch (error) {
      console.error("[SSR] Render error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    } finally {
      // Always clean up resources, even if rendering failed
      if (context && options.cleanup) {
        options.cleanup(context);
      }
    }
  };
}
