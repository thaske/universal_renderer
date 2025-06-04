import type { FastifyReply, FastifyRequest } from "fastify";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";

import { SSR_MARKERS } from "../../constants";
import type { FastifyStreamHandlerOptions } from "../types";

/**
 * Creates a streaming Server-Side Rendering route handler for Fastify, tailored for React 18+ streaming SSR.
 *
 * This handler expects POST requests with `{ url: string, props?: any, template: string }`
 * and returns streamed HTML responses for faster perceived performance.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for streaming SSR
 * @returns Fastify route handler for streaming SSR requests
 */
export function createStreamHandler<TContext extends Record<string, any>>(
  options: FastifyStreamHandlerOptions<TContext>,
) {
  if (!options.streamCallbacks) {
    throw new Error("streamCallbacks are required for streaming handler");
  }

  const streamCallbacks = options.streamCallbacks;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    let context: TContext | undefined;

    try {
      if (typeof request.body !== "object" || request.body === null) {
        reply.status(400).send("Invalid request body");
        return;
      }
      const {
        url,
        props = {},
        template = "",
      } = request.body as { url?: string; props?: any; template?: string };

      if (!url) {
        reply.status(400).send("URL is required");
        return;
      }

      if (
        typeof template !== "string" ||
        !template.includes(SSR_MARKERS.BODY)
      ) {
        reply
          .status(400)
          .send(`Template missing ${SSR_MARKERS.BODY} marker or not a string`);
        return;
      }

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

      const { pipe } = renderToPipeableStream(reactNode, {
        onShellReady() {
          reply.raw.setHeader("content-type", "text/html");

          const [headTemplate, tail] = template.split(SSR_MARKERS.BODY);

          Promise.resolve(streamCallbacks.head?.(context!))
            .then((finalHeadContent: string | undefined) => {
              let headToWrite = headTemplate;
              if (headTemplate && finalHeadContent) {
                headToWrite = headTemplate.replace(
                  SSR_MARKERS.HEAD,
                  finalHeadContent,
                );
              }
              reply.raw.write(headToWrite);

              const transform = streamCallbacks.transform?.(context!);

              if (transform) {
                const transformedStream = new PassThrough();
                transformedStream.pipe(reply.raw, { end: false });
                pipe(transformedStream);
                transformedStream.on("end", () => {
                  reply.raw.end(tail);
                });
              } else {
                const streamCompleter = new PassThrough();
                streamCompleter.pipe(reply.raw, { end: false });
                streamCompleter.on("end", () => {
                  if (!reply.raw.writableEnded) {
                    reply.raw.end(tail);
                  }
                });
                streamCompleter.on("error", (err) => {
                  console.error("[SSR] Fastify Stream completion error:", err);
                  if (!reply.raw.writableEnded) {
                    reply.raw.end(tail);
                  }
                });
                pipe(streamCompleter);
              }

              reply.raw.on("finish", () => {
                if (context && options.cleanup) options.cleanup(context);
              });
            })
            .catch((error: Error) => {
              console.error("[SSR] Fastify Stream head callback error:", error);
              if (options.error) {
                options.error(error, request, reply);
              } else {
                reply.status(500).send("Error during rendering head");
              }
            });
        },
        onShellError(error: unknown) {
          console.error("[SSR] Fastify Shell error:", error);
          if (options.error) {
            options.error(error as Error, request, reply);
          } else {
            reply.status(500).send("Error during rendering shell");
          }
        },
        onError(error: unknown) {
          console.error("[SSR] Fastify Stream error:", error);
          if (options.error) {
            options.error(error as Error, request, reply);
          } else {
            reply.status(500).send("Error during rendering stream");
          }
        },
      });
    } catch (error) {
      console.error("[SSR] Fastify Stream setup error:", error);
      if (options.error) {
        options.error(error as Error, request, reply);
      } else {
        reply.status(500).send("Internal Server Error");
      }
    }
  };
}
