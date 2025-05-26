import type { Handler } from "hono";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";
import { Writable } from "stream";

import { SSR_MARKERS } from "@/constants";
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
        throw new Error("No app callback or context.app/context.jsx provided");
      }

      const stream = new PassThrough();
      const encoder = new TextEncoder();

      const { pipe, abort } = renderToPipeableStream(reactNode, {
        onShellReady: async () => {
          const [head, tail] = template.split(SSR_MARKERS.BODY);
          let finalHead = head;
          if (streamCallbacks.head) {
            const headContent = await streamCallbacks.head(context!);
            if (headContent) {
              finalHead = head.replace(SSR_MARKERS.HEAD, headContent);
            }
          }
          // Immediately send the head
          controller.enqueue(encoder.encode(finalHead));

          const transform = streamCallbacks.transform?.(context!);
          if (transform) {
            stream.pipe(transform).pipe(
              new Writable({
                write(chunk, _encoding, callback) {
                  controller.enqueue(encoder.encode(chunk.toString()));
                  callback();
                },
                final(callback) {
                  controller.enqueue(encoder.encode(tail));
                  controller.close();
                  if (context && options.cleanup) options.cleanup(context!);
                  callback();
                },
              }),
            );
          } else {
            stream.pipe(
              new Writable({
                write(chunk, _encoding, callback) {
                  controller.enqueue(encoder.encode(chunk.toString()));
                  callback();
                },
                final(callback) {
                  controller.enqueue(encoder.encode(tail));
                  controller.close();
                  if (context && options.cleanup) options.cleanup(context!);
                  callback();
                },
              }),
            );
          }
          pipe(stream);
        },
        onShellError: (error: any) => {
          console.error("[SSR] Shell error");
          console.error(error);
          controller.error(error);
          if (context && options.cleanup) options.cleanup(context!);
        },
        onError: (error: any) => {
          console.error("[SSR] Stream error");
          console.error(error);
          // Don't call controller.error here as the stream might still be recoverable
          // However, we should ensure cleanup still happens if the stream is aborted.
          if (context && options.cleanup) {
            // Check if the stream was aborted, then cleanup.
            // This is a simplified check; in a real-world scenario, you might need a more robust way
            // to determine if the error is fatal and requires cleanup.
            if (error && error.message && error.message.includes("aborted")) {
              options.cleanup(context);
            }
          }
        },
      });

      let controller: ReadableStreamDefaultController<Uint8Array>;
      const readableStream = new ReadableStream({
        start(ctrl) {
          controller = ctrl;
        },
        cancel() {
          abort();
          if (context && options.cleanup) options.cleanup(context!);
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/html",
          "X-Content-Type-Options": "nosniff",
          "Transfer-Encoding": "chunked",
        },
      });
    } catch (error) {
      console.error("[SSR] Stream setup error");
      console.error(error);
      if (context && options.cleanup) options.cleanup(context);
      c.status(500);
      return c.text("Internal Server Error");
    }
  };
}
