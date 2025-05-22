import type { Request, Response } from "express";

import type { BaseCallbacks, RenderRequestProps } from "@/types";

import { handleError } from "@/utils";

// ---------------------------------------------------------------------------
// Helpers – small and side-effect-free to keep the handler body tidy
// ---------------------------------------------------------------------------

type RequestBody = {
  url: string;
  props?: RenderRequestProps;
};

/**
 * Extracts url/props from the request and performs basic validation.
 * If validation fails it writes an error response and returns `undefined`.
 */
function parseRequest(
  req: Request,
  res: Response,
): { url: string; props: RenderRequestProps } | undefined {
  const { url, props = {} } = (req.body || {}) as RequestBody;

  if (!url) {
    res.status(400).json({ error: "URL is required in the request body." });
    return;
  }

  return { url, props };
}

/**
 * Creates a static handler for the SSR server.
 *
 * @param callbacks - The callbacks for the static handler.
 * @returns A function that handles static rendering requests.
 */
export default function createStaticHandler<
  TContext extends Record<string, any>,
>({ callbacks }: { callbacks: BaseCallbacks<TContext> }) {
  return async function staticHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    let context: TContext | undefined;

    try {
      // 1. Validate request
      const parsed = parseRequest(req, res);
      if (!parsed) return; // Response already sent.

      const { url, props } = parsed;

      // 2. Application setup
      context = await callbacks.setup(url, props);

      if (!context) {
        res.status(500).json({
          error:
            "Server Error: Application setup failed to produce a valid context.",
        });
        return;
      }

      // 3. Ensure render callback
      if (!callbacks.render) {
        res.status(500).json({
          error:
            "Static rendering is not configured on the server (callbacks.render missing).",
        });
        return;
      }

      // 4. Produce static output
      const renderResult = await callbacks.render(context);
      res.json(renderResult);
    } catch (error: unknown) {
      handleError<TContext>(error, res, context, callbacks);
    } finally {
      if (context) {
        callbacks.cleanup(context);
      }
    }
  };
}
