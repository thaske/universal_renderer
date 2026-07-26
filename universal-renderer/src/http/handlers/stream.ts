import type { NextFunction, RequestHandler } from "express";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";

import type { ReactNode } from "react";
import { SSR_MARKERS } from "../../constants";
import type { ExpressStreamHandlerOptions } from "../types";
import { HttpError } from "./error";

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

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
    let context: TContext | undefined;
    let reactNode: ReactNode | undefined;
    let abortRender: (() => void) | undefined;
    let cleanupStarted = false;
    let stopped = false;
    let didRenderError = false;

    const cleanup = async () => {
      if (cleanupStarted || !context || !options.cleanup) return;

      cleanupStarted = true;
      try {
        await options.cleanup(context);
      } catch (error) {
        // Cleanup runs after the response lifecycle and cannot safely be sent
        // through Express once headers have been written.
        console.error("[SSR] Cleanup error:", error);
      }
    };

    const stopWithError = (error: unknown) => {
      if (stopped) return;

      stopped = true;
      abortRender?.();
      void cleanup();

      const normalizedError = asError(error);
      if (res.headersSent) {
        if (!res.destroyed) res.destroy(normalizedError);
      } else {
        next(normalizedError);
      }
    };

    let url: string;
    let props: Record<string, any>;
    let template: string;

    // Listen before setup: setup may be asynchronous, and a client can
    // disconnect before it returns a context that must be cleaned up.
    res.once("finish", () => {
      void cleanup();
    });
    res.once("close", () => {
      if (!res.writableFinished) {
        stopped = true;
        abortRender?.();
        void cleanup();
      }
    });

    try {
      if (
        !req.body ||
        typeof req.body !== "object" ||
        Array.isArray(req.body)
      ) {
        throw new HttpError("JSON request body is required", 400);
      }

      ({ url, props = {}, template } = req.body);

      if (!url || typeof url !== "string") {
        throw new HttpError("URL string is required", 400);
      }
      if (props === null || typeof props !== "object" || Array.isArray(props)) {
        throw new HttpError("Props must be an object", 400);
      }
      if (!template || typeof template !== "string") {
        throw new HttpError("Template string is required", 400);
      }
      if (!template.includes(SSR_MARKERS.BODY)) {
        throw new HttpError(`Template missing ${SSR_MARKERS.BODY} marker`, 400);
      }

      context = await options.setup(url, props);

      if (stopped || res.destroyed) {
        await cleanup();
        return;
      }

      if (streamCallbacks.node) {
        reactNode = streamCallbacks.node(context);
      } else if ("app" in context) {
        reactNode = context.app;
      } else if ("jsx" in context) {
        reactNode = context.jsx;
      } else {
        throw new HttpError("No app callback provided", 400);
      }
    } catch (error) {
      await cleanup();
      return next(error);
    }

    const startStreaming = async (
      pipe: (destination: NodeJS.WritableStream) => void,
    ) => {
      const bodyMarkerIndex = template.indexOf(SSR_MARKERS.BODY);
      const head = template.slice(0, bodyMarkerIndex);
      const tail = template.slice(bodyMarkerIndex + SSR_MARKERS.BODY.length);
      const finalHead = await streamCallbacks.head?.(context);

      if (stopped || res.destroyed) return;

      if (didRenderError) res.status(500);
      res.setHeader("content-type", "text/html");
      res.write(head.replace(SSR_MARKERS.HEAD, finalHead ?? ""));

      const stream = new PassThrough();
      const transform = streamCallbacks.transform?.(context);
      const output = transform ? stream.pipe(transform) : stream;

      const handleOutputError = (error: unknown) => stopWithError(error);
      stream.once("error", handleOutputError);
      if (output !== stream) output.once("error", handleOutputError);

      output.pipe(res, { end: false });
      output.once("end", () => {
        if (!stopped && !res.destroyed) res.end(tail);
      });

      pipe(stream);
    };

    try {
      const renderer = renderToPipeableStream(reactNode, {
        onShellReady() {
          void startStreaming(renderer.pipe).catch(stopWithError);
        },
        onShellError(error: unknown) {
          console.error("[SSR] Shell error:", error);
          stopWithError(error);
        },
        onError(error: unknown) {
          didRenderError = true;
          console.error("[SSR] Stream error:", error);
        },
      });
      abortRender = renderer.abort;
    } catch (error) {
      stopWithError(error);
    }
  };
}
