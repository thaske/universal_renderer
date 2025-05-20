import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import path from "node:path";

import createStaticHandler from "@/staticHandler";
import createStreamHandler from "@/streamHandler";
import { handleGenericError } from "@/utils";

import type { CreateSsrServerOptions, RenderContextBase } from "@/types";

export * from "@/types";

/**
 * Creates and configures an SSR server with Vite and Express.
 *
 * @param options Configuration options for the SSR server.
 * @returns An Express app instance, already configured and ready to be started with app.listen().
 */
export async function createSsrServer<
  TContext extends RenderContextBase = RenderContextBase,
>({
  vite,
  configureExpressApp,
  basePath = "/",
  coreCallbacks,
  streamCallbacks,
  staticCallbacks,
}: CreateSsrServerOptions<TContext>): Promise<Express> {
  if (!vite) throw new Error("Vite instance is required.");

  if (!staticCallbacks && !streamCallbacks) {
    throw new Error(
      "Either `staticCallbacks` or `streamCallbacks` must be provided.",
    );
  }

  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  if (configureExpressApp) await configureExpressApp(app, vite);

  // Use Vite's connect instance as middleware. This will enable HMR and other Vite features.
  // The `vite.middlewares` is a Connect instance, which is compatible with Express.
  app.use(vite.middlewares);

  // Health check endpoint
  app.get(
    `${basePath === "/" ? "" : basePath}/health`,
    (_req: Request, res: Response) => {
      res.json({ status: "OK", timestamp: new Date().toISOString() });
    },
  );

  // Register SSR routes
  // Ensure base path is handled correctly if not root
  const routePath = (p: string) => path.posix.join(basePath, p);

  if (staticCallbacks) {
    const staticRenderHandler = createStaticHandler<TContext>({
      coreCallbacks,
      staticCallbacks,
    });

    app.post(routePath("/"), staticRenderHandler);
    app.post(routePath("/static"), staticRenderHandler);
  }

  if (streamCallbacks) {
    const streamRenderHandler = createStreamHandler<TContext>({
      coreCallbacks,
      streamCallbacks,
    });

    app.post(routePath("/stream"), streamRenderHandler);
  }

  // Generic error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    // Vite's error middleware might have already handled it if it's a Vite-specific error
    // Delegate to Express default error handler if headers are sent
    if (res.headersSent) return next(err);
    else handleGenericError<TContext>(err, res, undefined, coreCallbacks);
  });

  // The user will call app.listen(port, () => { ... }) on the returned app instance
  return app;
}
