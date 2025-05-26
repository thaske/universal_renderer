import type { ReactNode } from "react";
// @ts-ignore - Bun uses edge runtime, type declarations might be missing for server.edge
// import { renderToReadableStream } from "react-dom/server.edge"; // Switch to node version
import { PassThrough, Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node"; // Use node version for onShellReady

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
      // Default error handling logic adapted for Bun: returns a Response
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

      // Use a Promise to handle the asynchronous nature of renderToPipeableStream
      return new Promise<Response>((resolve, reject) => {
        try {
          let controller: ReadableStreamDefaultController<Uint8Array>;
          const webReadableStream = new ReadableStream<Uint8Array>({
            start(c) {
              controller = c;
            },
            cancel(reason) {
              console.warn("[SSR] Bun web ReadableStream cancelled:", reason);
              // If the stream is cancelled, we might need to abort React's stream
              // This depends on whether abort() is already called in onShellError or onError
            },
          });

          // Bridge Node.js Writable to Web ReadableStream controller
          const nodeWritableBridge = new Writable({
            write(chunk, encoding, callback) {
              if (controller) {
                try {
                  if (typeof chunk === "string") {
                    controller.enqueue(new TextEncoder().encode(chunk));
                  } else if (chunk instanceof Uint8Array) {
                    controller.enqueue(chunk);
                  } else {
                    // Handle other chunk types if necessary, or throw error
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
              // Immediately resolve with the response, headers will be sent, then stream will flow.
              resolve(
                new Response(webReadableStream, {
                  status: 200,
                  headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    "Transfer-Encoding": "chunked", // Bun supports this
                  },
                }),
              );

              const [templateStart = "", templateEnd = ""] = template.split(
                SSR_MARKERS.BODY,
              );
              const headContent = streamCallbacks.head
                ? await streamCallbacks.head(context!)
                : "";

              // Write the initial part of the template to our bridge stream
              nodeWritableBridge.write(
                templateStart.replace(SSR_MARKERS.HEAD, headContent),
              );

              const transformStream = streamCallbacks.transform?.(context!);
              if (transformStream) {
                // Create an intermediate PassThrough to connect React's pipe to the transform stream,
                // and then the transform stream to our nodeWritableBridge.
                // React's pipe() method writes to a Writable.
                const intermediateRelay = new PassThrough();
                intermediateRelay
                  .pipe(transformStream)
                  .pipe(nodeWritableBridge);
                pipe(intermediateRelay);
              } else {
                pipe(nodeWritableBridge);
              }

              // Handling the end of the stream / templateEnd is crucial.
              // When the React stream piped to nodeWritableBridge ends, nodeWritableBridge.final() is called,
              // which closes the webReadableStream controller.
              // If templateEnd needs to be written, it must happen *before* controller.close().
              // This typically means it should be part of what's piped from React,
              // or if React's output doesn't include it, we need a way to append it.
              // For now, we assume React's stream contains everything up to where templateEnd would be, OR
              // templateEnd is not critical for the initial render/hydration strategy.
              // If templateEnd MUST be appended, we'd need a more complex setup,
              // perhaps by not directly piping to res or by using another PassThrough
              // after React's output but before nodeWritableBridge.end() is called.

              // Cleanup is associated with the original request lifecycle now,
              // rather than passthrough stream 'end'.
            },
            onShellError: async (err: any) => {
              console.error("[SSR] Bun Shell Error:", err);
              if (!headersSent) {
                // Headers not sent, try to send an error response
                // Abort React's stream first
                abort();
                // We'll try to resolve the main promise with an error response.
                // The webReadableStream might not have been used yet.
                resolve(
                  errorHandler(new Error("Shell rendering error"), request),
                );
              } else {
                // Headers sent, too late for a new response. Abort the stream.
                // The client will likely see an incomplete page.
                nodeWritableBridge.destroy(
                  err instanceof Error ? err : new Error(String(err)),
                );
                abort(); // Ensure React stream is aborted
              }
              if (cleanup && context) {
                await cleanup(context); // Perform cleanup regardless of header status
              }
            },
            onError: (error: unknown, errorInfo: unknown) => {
              console.error("[SSR] Bun Stream Error:", error, errorInfo);
              // This error is often a non-fatal error during streaming.
              // It might occur after the shell is ready and headers are sent.
              // We could try to signal an error on the stream if it's still active.
              if (!nodeWritableBridge.destroyed && controller) {
                // controller.error(error instanceof Error ? error : new Error(String(error)));
                // Calling controller.error() might be too abrupt if the client can handle partial content.
                // For now, primarily log. If the stream needs to be forcibly closed, consider abort() or nodeWritableBridge.destroy().
              }
              // Cleanup might be called here IF the error is deemed fatal for this request context
              // if (cleanup && context && !nodeWritableBridge.writableEnded) {
              // await cleanup(context);
              // }
            },
          });

          // Listen for the finish event on the nodeWritableBridge to perform cleanup
          // This ensures cleanup happens after all data from React has been processed
          // and the stream to the client has been closed by controller.close() in bridge.final().
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
            // This could be an error during writing to the bridge or from React's pipe.
            // If headers haven't been sent, we might still be able to send an error response.
            if (!headersSent) {
              abort(); // Abort React stream
              resolve(errorHandler(err, request));
            } else {
              // Headers sent, stream might be broken. Ensure React stream is aborted.
              if (!nodeWritableBridge.destroyed) {
                nodeWritableBridge.destroy(err);
              }
              abort();
            }
            // Perform cleanup if not already done
            // Be careful with multiple cleanup calls, ideally it's idempotent or guarded.
            if (cleanup && context) {
              // Consider a flag to prevent multiple cleanups if onShellError also calls it.
              // For now, let's assume cleanup can handle being called again or is quick.
              await cleanup(context);
            }
          });
        } catch (e: any) {
          // Catch synchronous errors during setup of renderToPipeableStream
          const errorToHandle = e instanceof Error ? e : new Error(String(e));
          // Resolve the main promise with the error Response
          resolve(errorHandler(errorToHandle, request));
        }
      });
    } catch (err: any) {
      // Catch errors from request body parsing or initial setup
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
