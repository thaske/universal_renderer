import createHandler from "@/handler";
import { adaptMiddleware, type ConnectMiddleware } from "@/middlewareAdapter";
import createStreamHandler from "@/streamHandler";
import type { CreateServerOptions } from "@/types/serverOptions";
export { adaptMiddleware } from "@/middlewareAdapter";

/**
 * Creates and configures an SSR server with Bun.
 *
 * @param options Configuration options for the SSR server.
 * @returns A Bun server instance, already configured and ready to be started with server.listen().
 */
export async function createServer<
  TContext extends Record<string, any> = Record<string, any>,
>({
  hostname,
  port,
  middleware,
  ...options
}: CreateServerOptions<TContext>): Promise<any> {
  if (!options.render) {
    throw new Error(
      "Either `callbacks.render` or `streamCallbacks` must be provided.",
    );
  }

  const { streamCallbacks, ...callbacks } = options;
  const handler = createHandler<TContext>({ callbacks });
  const streamHandler = createStreamHandler<TContext>({
    callbacks,
    streamCallbacks,
  });

  const routes: Record<string, any> = {
    "/health": () =>
      Response.json({
        status: "OK",
        timestamp: new Date().toISOString(),
      }),
    "/": { POST: handler },
    "/static": { POST: handler },
    "/stream": { POST: streamHandler },
  };

  if (middleware) {
    const middlewareHandler = adaptMiddleware(middleware as ConnectMiddleware);
    routes["/*"] = { GET: middlewareHandler, HEAD: middlewareHandler };
  }

  const server = Bun.serve({
    hostname,
    port,
    development: import.meta.env.MODE !== "production",
    routes,

    // Fallback for unmatched routes or older Bun versions.
    fetch(req: Request) {
      return new Response("Not Found", { status: 404 });
    },

    error(err) {
      console.error("[SSR] Unhandled server error:", err);

      // Decide on a response format – JSON is safest because every route in this
      // package speaks JSON.  During development we can expose the stack trace
      // too, but hide it in production.
      const body =
        import.meta.env.MODE !== "production"
          ? { error: err.message, stack: err.stack }
          : { error: "Internal Server Error" };

      return Response.json(body, { status: 500 });
    },
  });

  console.log(
    `[SSR] Server running on http://${server.hostname}:${server.port}`,
  );

  return server;
}
