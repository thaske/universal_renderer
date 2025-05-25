import type { RequestHandler } from "express";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";

import { SSR_MARKERS } from "@/constants";
import type { StreamHandlerOptions } from "@/types";
import type { ReactNode } from "react";

/**
 * Creates a streaming Server-Side Rendering route handler for React 18+ streaming SSR.
 *
 * This handler expects POST requests with `{ url: string, props?: any, template: string }`
 * and returns streamed HTML responses for faster perceived performance.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for streaming SSR
 * @returns Express route handler for streaming SSR requests
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createStreamHandler } from 'universal-renderer';
 *
 * const app = express();
 * app.use(express.json());
 *
 * app.post('/stream', createStreamHandler({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   streamCallbacks: {
 *     app: (context) => <App {...context} />,
 *     head: async (context) => `<title>${context.title}</title>`
 *   },
 *   cleanup: (context) => context.store?.dispose()
 * }));
 * ```
 */
export function createStreamHandler<TContext extends Record<string, any>>(
  options: StreamHandlerOptions<TContext>,
): RequestHandler {
  if (!options.streamCallbacks) {
    throw new Error("streamCallbacks are required for streaming handler");
  }

  const streamCallbacks = options.streamCallbacks;

  return async (req, res) => {
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

      let reactElement: ReactNode | undefined;
      if (streamCallbacks.app) {
        reactElement = streamCallbacks.app(context!);
      } else if (context && "app" in context) {
        reactElement = context.app;
      } else if (context && "jsx" in context) {
        reactElement = context.jsx;
      } else {
        throw new Error("No app callback provided");
      }

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
  };
}
