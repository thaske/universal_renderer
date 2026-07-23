import type { NextFunction, Request, Response } from "express";
import type { SSRHandlerOptions } from "../../types";
import { HttpError } from "./error";

/**
 * Creates a Server-Side Rendering route handler for Express.
 *
 * This handler expects POST requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head: string, body: string, body_attrs: object }`.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for SSR
 * @returns SSR handler
 */
export function createSSRHandler<TContext extends Record<string, any>>(
  options: SSRHandlerOptions<TContext>,
) {
  if (!options.render) {
    throw new Error("render callback is required");
  }
  if (!options.setup) {
    throw new Error("setup callback is required");
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    let context: TContext | undefined;

    try {
      if (
        !req.body ||
        typeof req.body !== "object" ||
        Array.isArray(req.body)
      ) {
        throw new HttpError("JSON request body is required", 400);
      }

      const { url, props = {} } = req.body;

      if (!url || typeof url !== "string") {
        throw new HttpError("URL string is required", 400);
      }
      if (props === null || typeof props !== "object" || Array.isArray(props)) {
        throw new HttpError("Props must be an object", 400);
      }

      context = await options.setup(url, props);
      const result = await options.render(context);

      res.json({
        head: result.head ?? "",
        body: result.body,
        body_attrs: result.bodyAttrs ?? {},
      });
    } catch (error) {
      return next(error);
    } finally {
      if (context && options.cleanup) {
        try {
          await options.cleanup(context);
        } catch (error) {
          // Cleanup must never turn a completed response into an unhandled
          // rejection. Rendering errors have already been delegated above.
          console.error("[SSR] Cleanup error:", error);
        }
      }
    }
  };
}
