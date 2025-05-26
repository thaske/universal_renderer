import type { Handler } from "hono";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";

import { SSR_MARKERS } from "../../core/constants";
import type { HonoStreamHandlerOptions } from "../types";

/**
 * Creates a streaming Server-Side Rendering route handler for React 18+ streaming SSR.
 *
 * This handler expects POST requests with `{ url: string, props?: any, template: string }`
 * and returns streamed HTML responses for faster perceived performance.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for streaming SSR
 * @returns Hono route handler for streaming SSR requests
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createStreamHandler } from 'universal-renderer/hono';
 *
 * const app = new Hono();
 *
 * app.post('/stream', createStreamHandler({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   streamCallbacks: {
 *     node: (context) => context.app,
 *     head: async (context) => `<title>${context.title}</title>`
 *   },
 *   cleanup: (context) => context.store?.dispose()
 * }));
 * ```
 */
export function createStreamHandler<TContext extends Record<string, any>>(
  options: HonoStreamHandlerOptions<TContext>,
): Handler {
  if (!options.streamCallbacks) {
    throw new Error("streamCallbacks are required for streaming handler");
  }

  const streamCallbacks = options.streamCallbacks;

  return async (c) => {
    let context: TContext | undefined;

    try {
      const body = await c.req.json();
      const { url, props = {}, template = "" } = body;

      if (!url) {
        c.status(400);
        return c.text("URL is required");
      }

      // Validate that the template contains the required body marker
      if (!template.includes(SSR_MARKERS.BODY)) {
        c.status(400);
        return c.text(`Template missing ${SSR_MARKERS.BODY} marker`);
      }

      // Set up the rendering context
      context = await options.setup(url, props);

      let reactNode;
      if (streamCallbacks.node) {
        reactNode = streamCallbacks.node(context!);
      } else if (context && "app" in context) {
        reactNode = context.app;
      } else if (context && "jsx" in context) {
        reactNode = context.jsx;
      } else {
        throw new Error("No app callback provided");
      }

      return new Response(
        new ReadableStream({
          start(controller) {
            const { pipe } = renderToPipeableStream(reactNode, {
              async onShellReady() {
                const [head, tail] = template.split(SSR_MARKERS.BODY);

                const finalHead = await streamCallbacks.head?.(context!);
                if (finalHead) {
                  controller.enqueue(
                    new TextEncoder().encode(
                      head.replace(SSR_MARKERS.HEAD, finalHead),
                    ),
                  );
                } else {
                  controller.enqueue(new TextEncoder().encode(head));
                }

                const stream = new PassThrough();
                const transform = streamCallbacks.transform?.(context!);

                if (transform) {
                  stream.pipe(transform);
                  transform.on("data", (chunk) => {
                    controller.enqueue(new TextEncoder().encode(chunk));
                  });
                  transform.on("end", () => {
                    controller.enqueue(new TextEncoder().encode(tail));
                    controller.close();
                    if (context && options.cleanup) options.cleanup(context);
                  });
                } else {
                  stream.on("data", (chunk) => {
                    controller.enqueue(new TextEncoder().encode(chunk));
                  });
                  stream.on("end", () => {
                    controller.enqueue(new TextEncoder().encode(tail));
                    controller.close();
                    if (context && options.cleanup) options.cleanup(context);
                  });
                }

                pipe(stream);
              },
              onShellError(error) {
                console.error("[SSR] Shell error");
                console.error(error);
                controller.error(error);
                if (context && options.cleanup) options.cleanup(context);
              },
              onError(error) {
                console.error("[SSR] Stream error");
                console.error(error);
                // Don't call controller.error here as the stream might still be recoverable
              },
            });
          },
        }),
        {
          headers: {
            "content-type": "text/html",
          },
        },
      );
    } catch (error) {
      console.error("[SSR] Stream setup error");
      console.error(error);
      c.status(500);
      return c.text("Internal Server Error");
    }
  };
}
