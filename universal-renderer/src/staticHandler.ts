import type { Request, Response } from "express";

import type { BaseCallbacks, RenderRequestProps } from "@/types";

import { handleGenericError } from "@/utils";

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
    let context: TContext | undefined = undefined;

    try {
      const { url, props = {} } = req.body as {
        url: string;
        props: RenderRequestProps;
      };

      if (!url) {
        res.status(400).json({ error: "URL is required in the request body." });

        return;
      }

      context = await callbacks.setup(url, props);

      if (!context) {
        console.error("[SSR] setup did not return a context.");

        if (!res.headersSent) {
          res
            .status(500)
            .send(
              "Server Error: Application setup failed to produce a valid context.",
            );
        } else if (!res.writableEnded) {
          res.end();
        }

        return;
      }

      if (!callbacks.render) {
        console.error(
          "Static rendering is not configured: callbacks.render is missing.",
        );

        res.status(500).json({
          error: "Static rendering is not properly configured on the server.",
        });

        return;
      }

      const renderResult = await callbacks.render(context);

      res.json(renderResult);
    } catch (error: unknown) {
      handleGenericError<TContext>(error, res, context, callbacks);
    } finally {
      if (context) {
        callbacks.cleanup(context);
      }
    }
  };
}
