import { PassThrough, Writable } from "node:stream";
import type { ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server.node";

import { SSR_MARKERS } from "@/constants";
import type {
  BunErrorHandler,
  BunRequestHandler,
  BunStreamHandlerOptions,
} from "../types";

/**
 * Creates a streaming Server-Side Rendering route handler for Bun (React 18+).
 *
 * This handler expects POST requests with `{ url: string, props?: any, template?: string }`
 * and returns streamed HTML responses.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for streaming SSR
 * @returns Bun route handler for streaming SSR requests
 */
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
    ((error: Error, _request: Request) => {
      console.error("[SSR] Unhandled stream error:", error);
      const isDev = process.env.NODE_ENV !== "production";
      return new Response(
        JSON.stringify({
          error: isDev ? error.message : "Internal Server Error",
          ...(isDev && { stack: error.stack }),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
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
      } else if (context && "app" in context && context.app) {
        reactNode = context.app as ReactNode;
      } else if (context && "jsx" in context && context.jsx) {
        reactNode = context.jsx as ReactNode;
      } else {
        throw new Error(
          "No React node found. Provide streamCallbacks.node or context.app/jsx.",
        );
      }

      return new Promise<Response>((resolve, reject) => {
        try {
          let controller: ReadableStreamDefaultController<Uint8Array>;
          const webReadableStream = new ReadableStream<Uint8Array>({
            start(c) {
              controller = c;
            },
            cancel(reason) {
              console.warn("[SSR] Bun web ReadableStream cancelled:", reason);
            },
          });

          const nodeWritableBridge = new Writable({
            write(chunk, encoding, callback) {
              if (controller) {
                try {
                  if (typeof chunk === "string") {
                    controller.enqueue(new TextEncoder().encode(chunk));
                  } else if (chunk instanceof Uint8Array) {
                    controller.enqueue(chunk);
                  } else {
                    console.warn(
                      "[SSR] Bun unhandled chunk type for stream bridge:",
                      typeof chunk,
                    );
                    controller.enqueue(new TextEncoder().encode(String(chunk)));
                  }
                  callback();
                } catch (e) {
                  callback(e instanceof Error ? e : new Error(String(e)));
                }
              } else {
                callback(new Error("Stream controller not available"));
              }
            },
            final(callback) {
              if (controller) {
                try {
                  controller.close();
                  callback();
                } catch (e) {
                  callback(e instanceof Error ? e : new Error(String(e)));
                }
              } else {
                callback(
                  new Error("Stream controller not available for closing"),
                );
              }
            },
            destroy(error, callback) {
              if (controller && error) {
                controller.error(error);
              }
              callback(error);
            },
          });

          let headersSent = false;

          const { pipe, abort } = renderToPipeableStream(reactNode, {
            onShellReady: async () => {
              headersSent = true;
              resolve(
                new Response(webReadableStream, {
                  status: 200,
                  headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Transfer-Encoding": "chunked",
                  },
                }),
              );

              const [templateStart = "", templateEnd = ""] = template.split(
                SSR_MARKERS.BODY,
              );
              const headContent = streamCallbacks.head
                ? await streamCallbacks.head(context!)
                : "";

              nodeWritableBridge.write(
                templateStart.replace(SSR_MARKERS.HEAD, headContent),
              );

              const transformStream = streamCallbacks.transform?.(context!);
              if (transformStream) {
                const intermediateRelay = new PassThrough();
                intermediateRelay
                  .pipe(transformStream)
                  .pipe(nodeWritableBridge);
                pipe(intermediateRelay);
              } else {
                pipe(nodeWritableBridge);
              }
            },
            onShellError: async (err: any) => {
              console.error("[SSR] Bun Shell Error:", err);
              if (!headersSent) {
                abort();
                resolve(
                  errorHandler(new Error("Shell rendering error"), request),
                );
              } else {
                nodeWritableBridge.destroy(
                  err instanceof Error ? err : new Error(String(err)),
                );
                abort();
              }
              if (cleanup && context) {
                await cleanup(context);
              }
            },
            onError: (error: unknown, errorInfo: unknown) => {
              console.error("[SSR] Bun Stream Error:", error, errorInfo);
              if (!nodeWritableBridge.destroyed && controller) {
              }
            },
          });

          nodeWritableBridge.on("finish", async () => {
            if (cleanup && context) {
              try {
                await cleanup(context);
              } catch (cleanupErr) {
                console.error(
                  "[SSR] Error during cleanup after stream finish:",
                  cleanupErr,
                );
              }
            }
          });

          nodeWritableBridge.on("error", async (err) => {
            console.error("[SSR] Bun nodeWritableBridge error:", err);
            if (!headersSent) {
              abort();
              resolve(errorHandler(err, request));
            } else {
              if (!nodeWritableBridge.destroyed) {
                nodeWritableBridge.destroy(err);
              }
              abort();
            }
            if (cleanup && context) {
              await cleanup(context);
            }
          });
        } catch (e: any) {
          const errorToHandle = e instanceof Error ? e : new Error(String(e));
          resolve(errorHandler(errorToHandle, request));
        }
      });
    } catch (err: any) {
      if (cleanup && context) {
        try {
          await cleanup(context);
        } catch (cleanupError) {
          console.error(
            "[SSR] Error during cleanup after stream setup error:",
            cleanupError,
          );
        }
      }
      return errorHandler(err, request);
    }
  };
}
