import type { NextFunction, Request, Response } from "express";
import {
  createLimiter,
  QueueAbortedError,
  RenderTimeoutError,
  withTimeout,
  type Limiter,
} from "../../concurrency";
import type { SSRHandlerOptions } from "../../types";
import { HttpError } from "./error";

/** Renders longer than this answer 504 rather than holding the caller open. */
export const DEFAULT_RENDER_TIMEOUT_MS = 10_000;

/**
 * Creates a Server-Side Rendering route handler for Express.
 *
 * This handler expects POST requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head, body, body_attrs, payload }`.
 *
 * Renders are serialized by default; pass a `limiter` (or use `createServer`'s
 * `concurrency` option) to change that.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for SSR
 * @returns SSR handler
 */
export function createSSRHandler<TContext extends Record<string, any>>(
  options: SSRHandlerOptions<TContext> & {
    limiter?: Limiter;
    renderTimeout?: number | false;
  },
) {
  if (!options.render) {
    throw new Error("render callback is required");
  }
  if (!options.setup) {
    throw new Error("setup callback is required");
  }

  const limiter = options.limiter ?? createLimiter(1);
  const renderTimeout = options.renderTimeout ?? DEFAULT_RENDER_TIMEOUT_MS;

  return async (req: Request, res: Response, next: NextFunction) => {
    const disconnected = new AbortController();
    req.once("aborted", () => disconnected.abort());
    res.once("close", () => disconnected.abort());

    let url: string;
    let props: Record<string, any>;

    try {
      if (
        !req.body ||
        typeof req.body !== "object" ||
        Array.isArray(req.body)
      ) {
        throw new HttpError("JSON request body is required", 400);
      }

      ({ url, props = {} } = req.body);

      if (!url || typeof url !== "string") {
        throw new HttpError("URL string is required", 400);
      }
      if (props === null || typeof props !== "object" || Array.isArray(props)) {
        throw new HttpError("Props must be an object", 400);
      }
    } catch (error) {
      // Outside the limiter, so a burst of malformed requests cannot queue behind
      // real renders.
      return next(error);
    }

    try {
      // The timeout wraps the limiter call, so queue time counts towards it. On
      // expiry the abort drops the request if it is still queued; if it is
      // already rendering, the slot stays held and `/health` reports a stall.
      const result = await withTimeout(
        limiter(
          async () => {
            let context: TContext | undefined;

            try {
              context = await options.setup(url, props);
              options.prepare?.(context);
              return await options.render(context);
            } finally {
              // Inside the limiter: cleanup restores what prepare mutated, so it
              // has to run before the next render starts.
              if (context && options.cleanup) {
                try {
                  await options.cleanup(context);
                } catch (error) {
                  // Never turn a completed response into an unhandled rejection.
                  console.error("[SSR] Cleanup error:", error);
                }
              }
            }
          },
          { signal: disconnected.signal },
        ),
        renderTimeout,
        () => disconnected.abort(),
      );

      if (res.destroyed) return;

      res.json({
        head: result.head ?? "",
        body: result.body,
        body_attrs: result.bodyAttrs ?? {},
        payload: result.payload ?? null,
      });
    } catch (error) {
      if (error instanceof QueueAbortedError && disconnected.signal.aborted) {
        return;
      }
      if (error instanceof RenderTimeoutError) {
        console.error(`[SSR] ${error.message} (${url})`);
      }
      return next(error);
    }
  };
}
