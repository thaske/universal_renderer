import uWS from "uWebSockets.js";
import { createHealthHandler } from "./handlers/health";
import { createSSRHandler } from "./handlers/ssr";
import { createStreamHandler } from "./handlers/stream";
import { readJson } from "./json";
import type { UWSServerOptions } from "./types";

export async function createServer<
  TContext extends Record<string, any> = Record<string, any>,
>(options: UWSServerOptions<TContext>): Promise<uWS.TemplatedApp> {
  if (!options.render) {
    throw new Error("render callback is required");
  }

  const app = uWS.App();

  const health = createHealthHandler();
  app.get("/health", (res) => {
    res.writeHeader("Content-Type", "application/json");
    res.end(health());
  });

  const ssr = createSSRHandler({
    setup: options.setup,
    render: options.render,
    cleanup: options.cleanup,
    error: options.error,
  });

  app.post("/", (res, req) => {
    readJson(
      res,
      (body) => {
        ssr(body, res);
      },
      () => {
        /* Request was prematurely aborted or invalid or missing, stop reading */
        console.log("Invalid JSON or no data at all!");
      },
    );
  });

  if (options.streamCallbacks) {
    const stream = createStreamHandler({
      setup: options.setup,
      cleanup: options.cleanup,
      streamCallbacks: options.streamCallbacks,
      error: options.error,
    });

    app.post("/stream", (res, req) => {
      readJson(
        res,
        (body) => {
          stream(body, res);
        },
        () => {
          /* Request was prematurely aborted or invalid or missing, stop reading */
          console.log("Invalid JSON or no data at all!");
        },
      );
    });
  }

  return app;
}
