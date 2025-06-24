import type { NextFunction, Request, Response } from "express";
import type { RenderOutput, SSRHandlerOptions } from "../../../types";
import { HttpError } from "./error";

/**
 * Creates a Server-Side Rendering route handler for Express.
 *
 * This handler expects POST requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head?: string, body: string, bodyAttrs?: string }`.
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
      const { url, props = {} } = req.body;

      if (!url || typeof url !== "string") {
        throw new HttpError("URL string is required", 400);
      }

      context = await options.setup(url, props);
      const result: RenderOutput = await options.render(context);

      res.json(result);
    } catch (error) {
      return next(error);
    } finally {
      if (context && options.cleanup) {
        await options.cleanup(context);
      }
    }
  };
}
