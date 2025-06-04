import type { Handler } from "hono";
import { renderToReadableStream } from "react-dom/server";
import type { ReactNode } from "react";

import { SSR_MARKERS } from "@/constants";
import type { HonoStreamHandlerOptions } from "../types";

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

      if (!template.includes(SSR_MARKERS.BODY)) {
        c.status(400);
        return c.text(`Template missing ${SSR_MARKERS.BODY} marker`);
      }

      context = await options.setup(url, props);

      let reactNode: ReactNode;
      if (streamCallbacks.node) {
        reactNode = streamCallbacks.node(context!);
      } else if (context && "app" in context) {
        reactNode = (context as any).app;
      } else if (context && "jsx" in context) {
        reactNode = (context as any).jsx;
      } else {
        throw new Error("No app callback or context.app/context.jsx provided");
      }

      const reactStream = (await renderToReadableStream(
        reactNode,
      )) as ReadableStream<Uint8Array>;
      await (reactStream as any).allReady;

      let bodyStream: ReadableStream<Uint8Array> = reactStream;
      const transform = streamCallbacks.transform?.(context!);
      if (transform) bodyStream = bodyStream.pipeThrough(transform);

      const [head, tail] = template.split(SSR_MARKERS.BODY);
      let finalHead = head;
      if (streamCallbacks.head) {
        const headContent = await streamCallbacks.head(context!);
        if (headContent) {
          finalHead = head.replace(SSR_MARKERS.HEAD, headContent);
        }
      }

      const encoder = new TextEncoder();
      const startChunk = encoder.encode(finalHead);
      const tailChunk = encoder.encode(tail ?? "");

      const readableStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(startChunk);
          const reader = bodyStream.getReader();
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
          } catch (err) {
            controller.error(err);
          } finally {
            controller.enqueue(tailChunk);
            controller.close();
            if (context && options.cleanup) await options.cleanup(context);
          }
        },
        cancel(reason) {
          bodyStream.cancel(reason);
          if (context && options.cleanup) options.cleanup(context);
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
