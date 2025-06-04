import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";

import { SSR_MARKERS } from "@/constants";
import type {
  BunErrorHandler,
  BunRequestHandler,
  BunStreamHandlerOptions,
} from "../types";

export function createStreamHandler<TContext extends Record<string, any>>(
  options: BunStreamHandlerOptions<TContext>,
): BunRequestHandler {
  const {
    setup,
    streamCallbacks,
    cleanup,
    error: customErrorHandler,
  } = options;

  const errorHandler: BunErrorHandler =
    customErrorHandler ||
    ((error: Error) => {
      console.error("[SSR] Unhandled stream error:", error);
      const isDev = process.env.NODE_ENV !== "production";
      return new Response(
        JSON.stringify({
          error: isDev ? error.message : "Internal Server Error",
          ...(isDev && { stack: error.stack }),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    });

  if (!streamCallbacks) {
    throw new Error("streamCallbacks are required for the streaming handler");
  }
  if (!setup) {
    throw new Error("setup callback is required for StreamHandler");
  }

  return async (request: Request): Promise<Response> => {
    let context: TContext | undefined;
    try {
      if (request.method !== "POST") {
        throw new Error(
          `Unsupported method: ${request.method}. Stream handler expects POST.`,
        );
      }

      const requestBody = await request.json().catch(() => {
        throw new Error("Invalid JSON body for stream");
      });

      const {
        url,
        props = {},
        template = "",
      } = requestBody as {
        url: string;
        props?: Record<string, any>;
        template?: string;
      };

      if (!url || typeof url !== "string") {
        throw new Error(
          "URL string is required in the request body for stream",
        );
      }

      if (!template || !template.includes(SSR_MARKERS.BODY)) {
        throw new Error(
          `Template string with ${SSR_MARKERS.BODY} marker is required for stream`,
        );
      }

      context = await setup(url, props);

      let reactNode: ReactNode;
      if (streamCallbacks.node) {
        reactNode = streamCallbacks.node(context!);
      } else if (context && "app" in context && (context as any).app) {
        reactNode = (context as any).app as ReactNode;
      } else if (context && "jsx" in context && (context as any).jsx) {
        reactNode = (context as any).jsx as ReactNode;
      } else {
        throw new Error(
          "No React node found. Provide streamCallbacks.node or context.app/jsx.",
        );
      }

      const reactStream = (await renderToReadableStream(
        reactNode,
      )) as ReadableStream<Uint8Array>;
      await (reactStream as any).allReady;

      let bodyStream: ReadableStream<Uint8Array> = reactStream;
      const transform = streamCallbacks.transform?.(context!);
      if (transform) bodyStream = bodyStream.pipeThrough(transform);

      const [templateStart = "", templateEnd = ""] = template.split(
        SSR_MARKERS.BODY,
      );
      const headContent = streamCallbacks.head
        ? await streamCallbacks.head(context!)
        : "";
      const encoder = new TextEncoder();
      const startChunk = encoder.encode(
        templateStart.replace(SSR_MARKERS.HEAD, headContent),
      );
      const endChunk = encoder.encode(templateEnd);

      const finalStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(startChunk);
          const reader = bodyStream.getReader();
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
          } catch (e) {
            controller.error(e);
          } finally {
            controller.enqueue(endChunk);
            controller.close();
            if (cleanup && context) await cleanup(context);
          }
        },
        cancel(reason) {
          bodyStream.cancel(reason);
          if (cleanup && context) cleanup(context);
        },
      });

      return new Response(finalStream, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Transfer-Encoding": "chunked",
        },
      });
    } catch (err: any) {
      if (cleanup && context) {
        try {
          await cleanup(context);
        } catch (cleanupErr) {
          console.error(
            "[SSR] Error during cleanup after stream setup error:",
            cleanupErr,
          );
        }
      }
      const errorToHandle = err instanceof Error ? err : new Error(String(err));
      return errorHandler(errorToHandle, request);
    }
  };
}
