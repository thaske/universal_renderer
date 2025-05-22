import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import path from "node:path";

import createStaticHandler from "@/staticHandler";
import createStreamHandler from "@/streamHandler";
import type { CreateSsrServerOptions } from "@/types";
import { handleError } from "@/utils";
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

  if (middleware) await middleware(app);

  applyBodyParsers(app);
  registerHealthCheck(app, basePath);

  // Register SSR routes
  // Ensure base path is handled correctly if not root
  registerSsrRoutes(app, basePath, callbacks, streamCallbacks);

  // Generic error handler
  registerErrorHandler(app, callbacks);

  // The user will call app.listen(port, () => { ... }) on the returned app instance
  return app;
}

// ---------------------------------------------------------------------------
// Helpers – kept local to avoid increasing public surface area
// ---------------------------------------------------------------------------

/** Adds JSON / URL-encoded body parsers with generous limits */
function applyBodyParsers(app: Express) {
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));
}

/** Health-check endpoint so load-balancers can probe the service */
function registerHealthCheck(app: Express, basePath: string) {
  app.get(
    path.posix.join(basePath === "/" ? "" : basePath, "/health"),
    (_req, res) => {
      res.json({ status: "OK", timestamp: new Date().toISOString() });
    },
  );
}

/** Registers static + stream render routes depending on provided callbacks. */
function registerSsrRoutes<TContext extends Record<string, any>>(
  app: Express,
  basePath: string,
  callbacks: CreateSsrServerOptions<TContext>["callbacks"],
  streamCallbacks?: CreateSsrServerOptions<TContext>["streamCallbacks"],
) {
  const route = (p: string) => path.posix.join(basePath, p);

  const staticHandler = createStaticHandler<TContext>({ callbacks });
  app.post(route("/"), staticHandler);
  app.post(route("/static"), staticHandler);

  if (streamCallbacks) {
    const streamHandler = createStreamHandler<TContext>({
      callbacks,
      streamCallbacks,
    });
    app.post(route("/stream"), streamHandler);
  }
}

/** Generic error handler wired as the last middleware. */
function registerErrorHandler<TContext extends Record<string, any>>(
  app: Express,
  callbacks: CreateSsrServerOptions<TContext>["callbacks"],
) {
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- express signature
  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    handleError<TContext>(err, res, undefined, callbacks);
  });
}
