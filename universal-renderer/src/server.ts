import express from "express";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";

import { SSR_MARKERS } from "./constants";
import type { ServerOptions } from "./server.d";

/**
 * Creates an Express server configured for Server-Side Rendering (SSR).
 *
 * This function sets up a complete SSR server with the following endpoints:
 * - `GET /health` - Health check endpoint
 * - `POST /` and `POST /static` - JSON-based SSR rendering
 * - `POST /stream` - Streaming SSR (if streamCallbacks provided)
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for the SSR server
 * @returns Promise that resolves to a configured Express application
 *
 * @example
 * ```typescript
 * import { createServer } from 'universal-renderer';
 * import { renderToString } from 'react-dom/server';
 *
 * const app = await createServer({
 *   setup: async (url, props) => {
 *     // Set up your app context
 *     return { url, props, store: createStore() };
 *   },
 *   render: async (context) => {
 *     // Render your React app
 *     const html = renderToString(<App {...context} />);
 *     return { body: html };
 *   },
 *   cleanup: (context) => {
 *     // Clean up resources
 *     context.store?.dispose();
 *   }
 * });
 *
 * app.listen(3001, () => {
 *   console.log('SSR server running on port 3001');
 * });
 * ```
 */
export async function createServer<TContext = any>(
  options: ServerOptions<TContext>,
): Promise<express.Application> {
  if (!options.render) {
    throw new Error("render callback is required");
  }

  const app = express();

  // Basic middleware
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  // JSON SSR endpoint - handles standard SSR requests
  // Expects: { url: string, props?: any }
  // Returns: { head?: string, body: string, bodyAttrs?: string }
  app.post(["/", "/static"], async (req, res) => {
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
  });

  // Streaming SSR endpoint (if streaming is configured)
  // Enables React 18+ streaming for faster perceived performance
  // Expects: { url: string, props?: any, template: string }
  // Returns: Streamed HTML response
  if (options.streamCallbacks) {
    const streamCallbacks = options.streamCallbacks;

    app.post("/stream", async (req, res) => {
      let context: TContext | undefined;

      try {
        const { url, props = {}, template = "" } = req.body;

        if (!url) {
          return res.status(400).send("URL is required");
        }

        // Validate that the template contains the required body marker
        if (!template.includes(SSR_MARKERS.BODY)) {
          return res
            .status(400)
            .send(`Template missing ${SSR_MARKERS.BODY} marker`);
        }

        // Set up the rendering context
        context = await options.setup(url, props);
        const reactElement = streamCallbacks.app(context);

        res.setHeader("Content-Type", "text/html; charset=utf-8");

        // Split the template at the body marker to get head and tail parts
        const [headPart, tailPart] = template.split(SSR_MARKERS.BODY);

        // Inject head tags if available
        let finalHead = headPart;
        if (streamCallbacks.head) {
          const headTags = await streamCallbacks.head(context);
          if (headTags) {
            finalHead = headPart.replace(SSR_MARKERS.HEAD, headTags);
          }
        }

        // Send the head part immediately
        res.write(finalHead);

        const { pipe } = renderToPipeableStream(reactElement, {
          onShellReady() {
            const stream = new PassThrough();
            const transform = streamCallbacks.transform?.(context!);

            if (transform) {
              stream.pipe(transform).pipe(res, { end: false });
            } else {
              stream.pipe(res, { end: false });
            }

            pipe(stream);

            stream.on("end", async () => {
              try {
                await streamCallbacks.close?.(res, context!);
              } finally {
                res.end(tailPart);
              }
            });
          },
          onShellError(error) {
            console.error("[SSR] Shell error:", error);
            res.status(500).send("Error during rendering");
          },
          onError(error) {
            console.error("[SSR] Stream error:", error);
          },
        });
      } catch (error) {
        console.error("[SSR] Stream setup error:", error);
        res.status(500).send("Internal Server Error");
      } finally {
        if (context && options.cleanup) {
          options.cleanup(context);
        }
      }
    });
  }

  // Custom middleware
  if (options.middleware) {
    app.use(options.middleware);
  }

  // Error handler
  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      console.error("[SSR] Unhandled error:", err);
      const isDev = process.env.NODE_ENV !== "production";
      res.status(500).json({
        error: isDev ? err.message : "Internal Server Error",
        ...(isDev && { stack: err.stack }),
      });
    },
  );

  return app;
}
