import type { NextFunction, RequestHandler } from "express";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";

import type { ReactNode } from "react";
import {
  acquire,
  createLimiter,
  RenderTimeoutError,
  type Limiter,
} from "../../concurrency";
import { SSR_MARKERS } from "../../constants";
import type { ExpressStreamHandlerOptions } from "../types";
import { DEFAULT_RENDER_TIMEOUT_MS } from "./ssr";
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
 * A streaming render holds its concurrency slot until the response finishes or
 * the client disconnects, not just until the shell is ready — the tree is still
 * reading module state for as long as it is producing chunks.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for streaming SSR
 * @returns Express route handler for streaming SSR requests
 */
export function createStreamHandler<TContext extends Record<string, any>>(
  options: ExpressStreamHandlerOptions<TContext> & {
    limiter?: Limiter;
    renderTimeout?: number | false;
  },
): RequestHandler {
  if (!options.streamCallbacks)
    throw new Error("streamCallbacks are required for streaming handler");
  if (!options.setup) {
    throw new Error("setup callback is required");
  }

  const { streamCallbacks } = options;
  const limiter = options.limiter ?? createLimiter(1);
  const renderTimeout = options.renderTimeout ?? DEFAULT_RENDER_TIMEOUT_MS;

  return async (req, res, next: NextFunction) => {
    let context: TContext | undefined;
    let reactNode: ReactNode | undefined;
    let abortRender: (() => void) | undefined;
    let cleanupStarted = false;
    let cleanupRequested = false;
    let setupSettled = false;
    let startupInFlight = 0;
    let stopped = false;
    let didRenderError = false;

    let releaseSlot: (() => void) | undefined;
    const disconnected = new AbortController();

    let shellTimer: ReturnType<typeof setTimeout> | undefined;
    const clearShellTimer = () => {
      if (shellTimer) clearTimeout(shellTimer);
      shellTimer = undefined;
    };

    // Runs the context cleanup and releases the slot. Idempotent: `finish`,
    // `close`, and the error path all reach it.
    //
    // A no-op before setup settles. A client can disconnect while setup is still
    // awaiting, and finalizing there would miss the context setup is about to
    // return; the post-setup check notices `stopped` and finalizes then. It also
    // waits for async stream startup, since the `head` callback still reads
    // shared state.
    const cleanup = async () => {
      cleanupRequested = true;
      clearShellTimer();
      if (!setupSettled || cleanupStarted || startupInFlight > 0) return;
      cleanupStarted = true;

      try {
        if (context && options.cleanup) await options.cleanup(context);
      } catch (error) {
        // Too late to route through Express; headers are already written.
        console.error("[SSR] Cleanup error:", error);
      } finally {
        releaseSlot?.();
      }
    };

    const stopWithError = (error: unknown) => {
      if (stopped) return;

      stopped = true;
      clearShellTimer();
      abortRender?.();
      void cleanup();

      const normalizedError = asError(error);
      if (res.headersSent) {
        if (!res.destroyed) res.destroy(normalizedError);
      } else {
        next(normalizedError);
      }
    };

    const stopForDisconnect = () => {
      if (stopped) return;

      stopped = true;
      clearShellTimer();
      disconnected.abort();
      abortRender?.();
      void cleanup();
    };

    // Bounds arrival to first byte: queue wait, setup, and shell render. The rest
    // of the stream is deliberately unbounded, but the slot is held until the
    // response finishes, so a tree that stalls after the shell blocks every
    // render behind it at `concurrency: 1`. Recovery is external: `/health`
    // reports the held slot and `bin/web` restarts the renderer.
    //
    // Firing before `setup` settles leaves the slot held, by the same design as
    // `cleanup`. Firing after aborts the React render, which does return it.
    if (renderTimeout && renderTimeout > 0) {
      shellTimer = setTimeout(() => {
        console.error(
          `[SSR] stream shell did not start within ${renderTimeout}ms`,
        );
        stopWithError(new RenderTimeoutError(renderTimeout));
      }, renderTimeout);
      shellTimer.unref?.();
    }

    let url: string;
    let props: Record<string, any>;
    let template: string;

    // Before setup, which may await: a client can disconnect before it returns
    // a context that needs cleaning up.
    res.once("finish", () => {
      void cleanup();
    });
    req.once("aborted", stopForDisconnect);
    res.once("close", () => {
      if (!res.writableFinished) stopForDisconnect();
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

      releaseSlot = await acquire(limiter, { signal: disconnected.signal });
      try {
        context = await options.setup(url, props);
      } finally {
        setupSettled = true;
      }

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

      // No await between this and the render; see BaseHandlerOptions.prepare.
      options.prepare?.(context);
    } catch (error) {
      clearShellTimer();
      await cleanup();
      if (stopped || res.destroyed) return;
      return next(error);
    }

    const startStreaming = async (
      pipe: (destination: NodeJS.WritableStream) => void,
    ) => {
      startupInFlight += 1;

      try {
        const bodyMarkerIndex = template.indexOf(SSR_MARKERS.BODY);
        const head = template.slice(0, bodyMarkerIndex);
        const tail = template.slice(bodyMarkerIndex + SSR_MARKERS.BODY.length);
        const finalHead = await streamCallbacks.head?.(context);

        if (stopped || res.destroyed) return;

        if (didRenderError) res.status(500);
        res.setHeader("content-type", "text/html");
        // Function replacement: `$&` and `$1` in a string replacement are
        // substitution patterns, and `$` is legal in CSS-in-JS class names.
        res.write(head.replace(SSR_MARKERS.HEAD, () => finalHead ?? ""));
        // First byte is out; the shell timeout has done its job.
        clearShellTimer();

        const stream = new PassThrough();
        const transform = streamCallbacks.transform?.(context);
        // Widened: PassThrough and ReadWriteStream have overload sets TypeScript
        // cannot reconcile into one callable `once`.
        const output: NodeJS.ReadableStream = transform
          ? stream.pipe(transform)
          : stream;

        const handleOutputError = (error: unknown) => stopWithError(error);
        stream.once("error", handleOutputError);
        if (output !== stream) output.once("error", handleOutputError);

        output.pipe(res, { end: false });
        output.once("end", () => {
          if (!stopped && !res.destroyed) res.end(tail);
        });

        pipe(stream);
      } finally {
        startupInFlight -= 1;
        if (cleanupRequested || stopped || res.destroyed) await cleanup();
      }
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
