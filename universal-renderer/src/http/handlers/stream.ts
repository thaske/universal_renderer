import type { NextFunction, RequestHandler } from "express";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";

import type { ReactNode } from "react";
import { SSR_MARKERS } from "../../constants";
import type { ExpressStreamHandlerOptions } from "../types";
import { HttpError } from "./error";

/**
 * Creates a streaming Server-Side Rendering route handler for React 18+ streaming SSR.
 *
 * This handler expects POST requests with `{ url: string, props?: any, template: string }`
 * and returns streamed HTML responses for faster perceived performance.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for streaming SSR
 * @returns Express route handler for streaming SSR requests
 */
export function createStreamHandler<TContext extends Record<string, any>>(
  options: ExpressStreamHandlerOptions<TContext>,
): RequestHandler {
  if (!options.streamCallbacks)
    throw new Error("streamCallbacks are required for streaming handler");

  const { streamCallbacks } = options;

  return async (req, res, next: NextFunction) => {
    const { url = "", props = {}, template = "" } = req.body;

    let context: TContext | undefined;
    let reactNode: ReactNode | undefined;

    try {
      if (!url) {
        throw new HttpError("URL is required", 400);
      }

      if (!template) {
        throw new HttpError("Template is required", 400);
      }

      if (!template.includes(SSR_MARKERS.BODY)) {
        throw new HttpError(`Template missing ${SSR_MARKERS.BODY} marker`, 400);
      }

      context = await options.setup(url, props);

      if (streamCallbacks.node) {
        reactNode = streamCallbacks.node(context!);
      } else if (context && "app" in context) {
        reactNode = context.app;
      } else if (context && "jsx" in context) {
        reactNode = context.jsx;
      } else {
        throw new HttpError("No app callback provided", 400);
      }
    } catch (error) {
      return next(error);
    }

    const { pipe } = renderToPipeableStream(reactNode, {
      async onShellReady() {
        res.setHeader("content-type", "text/html");

        const [head, tail] = template.split(SSR_MARKERS.BODY);

        const finalHead = await streamCallbacks.head?.(context!);
        res.write(head.replace(SSR_MARKERS.HEAD, finalHead ?? ""));

        const stream = new PassThrough();
        const transform = streamCallbacks.transform?.(context!);

        // Watch the end of the pipeline, not the source: with a transform,
        // the PassThrough can end while the transform still holds buffered
        // output, and writing the tail then would interleave it into the body.
        const output = transform ? stream.pipe(transform) : stream;
        output.pipe(res, { end: false });
        pipe(stream);

        output.on("end", () => {
          res.end(tail);
        });

        res.on("finish", () => {
          if (context) options.cleanup?.(context);
        });
      },
      onShellError(error: unknown) {
        console.error("[SSR] Shell error:", error);
        if (!res.headersSent) next(error);
      },
      onError(error: unknown) {
        console.error("[SSR] Stream error:", error);
        if (!res.headersSent) next(error);
      },
    });
  };
}
