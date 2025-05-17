import type { Request, Response } from "express";
import type { ViteDevServer } from "vite";

import type {
  AppSetupResultBase,
  CoreRenderCallbacks,
  RenderRequestProps,
  StaticRenderResult,
  StaticSpecificCallbacks,
} from "./types";
import { handleGenericError } from "./utils";

export default function createStaticHandler<
  TSetupResult extends AppSetupResultBase = AppSetupResultBase,
>(
  vite: ViteDevServer,
  callbacks: {
    coreCallbacks: CoreRenderCallbacks<TSetupResult>;
    staticCallbacks?: StaticSpecificCallbacks<TSetupResult>;
  }
) {
  const { coreCallbacks, staticCallbacks } = callbacks;

  return async function staticHandler(
    req: Request,
    res: Response
  ): Promise<void> {
    let appSetupResult: TSetupResult | undefined = undefined;
    try {
      const { url, props = {} } = req.body as {
        url: string;
        props: RenderRequestProps;
      };

      if (!url) {
        res.status(400).json({ error: "URL is required in the request body." });
        return;
      }

      appSetupResult = await coreCallbacks.setup(url, props);

      if (!staticCallbacks || !staticCallbacks.render) {
        console.error(
          "Static rendering is not configured: staticCallbacks.render is missing."
        );
        res.status(500).json({
          error: "Static rendering is not properly configured on the server.",
        });
        return;
      }

      const renderResult: StaticRenderResult =
        await staticCallbacks.render(appSetupResult);

      res.json(renderResult);
    } catch (error: unknown) {
      handleGenericError<TSetupResult>(
        error,
        res,
        vite,
        appSetupResult,
        coreCallbacks
      );
    } finally {
      if (appSetupResult) {
        coreCallbacks.cleanup(appSetupResult);
      }
    }
  };
}
