import type { Request, Response } from "express";
import type { ViteDevServer } from "vite";

import type {
  CoreRenderCallbacks,
  RenderRequestProps,
  SetupResultBase,
  StaticSpecificCallbacks,
} from "@/types";

import { handleGenericError } from "@/utils";

/**
 * Creates a static handler for the SSR server.
 *
 * @param vite - The Vite dev server instance.
 * @param callbacks - The callbacks for the static handler.
 * @returns A function that handles static rendering requests.
 */
export default function createStaticHandler<
  TSetupResult extends SetupResultBase = SetupResultBase,
>(
  vite: ViteDevServer,
  callbacks: {
    coreCallbacks: CoreRenderCallbacks<TSetupResult>;
    staticCallbacks?: StaticSpecificCallbacks<TSetupResult>;
  },
) {
  const { coreCallbacks, staticCallbacks } = callbacks;

  return async function staticHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    let setupResult: TSetupResult | undefined = undefined;

    try {
      const { url, props = {} } = req.body as {
        url: string;
        props: RenderRequestProps;
      };

      if (!url) {
        res.status(400).json({ error: "URL is required in the request body." });

        return;
      }

      setupResult = await coreCallbacks.setup(url, props);

      if (!setupResult) {
        console.error("[SSR] setup did not return a result.");

        if (!res.headersSent) {
          res
            .status(500)
            .send(
              "Server Error: Application setup failed to produce a valid result.",
            );
        } else if (!res.writableEnded) {
          res.end();
        }

        return;
      }

      if (!staticCallbacks || !staticCallbacks.render) {
        console.error(
          "Static rendering is not configured: staticCallbacks.render is missing.",
        );

        res.status(500).json({
          error: "Static rendering is not properly configured on the server.",
        });

        return;
      }

      const renderResult = await staticCallbacks.render(setupResult);

      res.json(renderResult);
    } catch (error: unknown) {
      handleGenericError<TSetupResult>(
        error,
        res,
        vite,
        setupResult,
        coreCallbacks,
      );
    } finally {
      if (setupResult) {
        coreCallbacks.cleanup(setupResult);
      }
    }
  };
}
