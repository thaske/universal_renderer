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

import type { CreateSsrServerOptions } from "@/types";

export * from "@/types";

/**
 * Creates and configures an SSR server with Express.
 *
 * @param options Configuration options for the SSR server.
 * @returns An Express app instance, already configured and ready to be started with app.listen().
 */
export async function createSsrServer<
  TContext extends Record<string, any> = Record<string, any>,
>({
  middleware,
  basePath = "/",
  callbacks,
  streamCallbacks,
}: CreateSsrServerOptions<TContext>): Promise<Express> {
  if (!callbacks.render && !streamCallbacks) {
    throw new Error(
      "Either `callbacks.render` or `streamCallbacks` must be provided.",
    );
  }

  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  if (middleware) await middleware(app);

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

  const staticRenderHandler = createStaticHandler<TContext>({
    callbacks,
  });
  app.post(routePath("/"), staticRenderHandler);
  app.post(routePath("/static"), staticRenderHandler);

  if (streamCallbacks) {
    const streamRenderHandler = createStreamHandler<TContext>({
      callbacks,
      streamCallbacks,
    });

    app.post(routePath("/stream"), streamRenderHandler);
  }

  // Generic error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    // Delegate to Express default error handler if headers are sent
    if (res.headersSent) return next(err);
    else handleGenericError<TContext>(err, res, undefined, callbacks);
  });

  // The user will call app.listen(port, () => { ... }) on the returned app instance
  return app;
}
