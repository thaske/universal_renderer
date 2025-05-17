import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import path from "node:path";
import { createServer } from "vite";

import createStaticHandler from "./staticHandler";
import createStreamHandler from "./streamHandler";
import type { AppSetupResultBase, CreateSsrServerOptions } from "./types";
import { handleGenericError } from "./utils";
export * from "./types";

/**
 * Creates and configures an SSR server with Vite and Express.
 *
 * @param options Configuration options for the SSR server.
 * @returns An Express app instance, already configured and ready to be started with app.listen().
 */
export async function createSsrServer<
  TSetupResult extends AppSetupResultBase = AppSetupResultBase,
>({
  configureExpressApp,
  basePath = "/",
  coreCallbacks,
  streamCallbacks,
  staticCallbacks,
}: CreateSsrServerOptions<TSetupResult>): Promise<Express> {
  if (!staticCallbacks && !streamCallbacks) {
    throw new Error(
      "Either `staticCallbacks` or `streamCallbacks` must be provided."
    );
  }

  const vite = await createServer({
    server: { middlewareMode: true, allowedHosts: ["tempo.ssr"] },
    appType: "custom",
  });

  const app = express();

  if (configureExpressApp) await configureExpressApp(app, vite);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Use Vite's connect instance as middleware. This will enable HMR and other Vite features.
  // The `vite.middlewares` is a Connect instance, which is compatible with Express.
  app.use(vite.middlewares);

  // Health check endpoint
  app.get(
    `${basePath === "/" ? "" : basePath}/health`,
    (_req: Request, res: Response) => {
      res.json({ status: "OK", timestamp: new Date().toISOString() });
    }
  );

  // Register SSR routes
  // Ensure base path is handled correctly if not root
  const routePath = (p: string) => path.posix.join(basePath, p);

  if (staticCallbacks) {
    const staticRenderHandler = createStaticHandler<TSetupResult>(vite, {
      coreCallbacks,
      staticCallbacks,
    });
    app.post(routePath("/"), staticRenderHandler);
    app.post(routePath("/static"), staticRenderHandler);
  }

  if (streamCallbacks) {
    const streamRenderHandler = createStreamHandler<TSetupResult>(vite, {
      coreCallbacks,
      streamCallbacks,
    });
    app.post(routePath("/stream"), streamRenderHandler);
  }

  // Generic error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    // Vite's error middleware might have already handled it if it's a Vite-specific error
    if (res.headersSent) {
      return next(err); // Delegate to Express default error handler if headers are sent
    }
    handleGenericError<TSetupResult>(err, res, vite, undefined, coreCallbacks);
  });

  return app;
  // The user will call app.listen(port, () => { ... }) on the returned app instance
}
