import uWS from "uWebSockets.js";
import {
  createErrorHandler,
  createHealthHandler,
  createSSRHandler,
  createStreamHandler,
} from "./handlers";
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

  const jsonHandler = (handler: (body: any, res: uWS.HttpResponse) => void) => {
    return (res: uWS.HttpResponse, _req: uWS.HttpRequest) => {
      let body = "";
      res.onData((chunk, isLast) => {
        body += Buffer.from(chunk).toString();
        if (isLast) {
          try {
            const data = body ? JSON.parse(body) : {};
            handler(data, res);
          } catch (err) {
            createErrorHandler()(res, err as Error);
          }
        }
      });
    };
  };

  app.post("/", jsonHandler(ssr));
  app.post("/static", jsonHandler(ssr));

  if (options.streamCallbacks) {
    const stream = createStreamHandler({
      setup: options.setup,
      cleanup: options.cleanup,
      streamCallbacks: options.streamCallbacks,
      error: options.error,
    });
    app.post("/stream", jsonHandler(stream));
  }

  return app;
}
