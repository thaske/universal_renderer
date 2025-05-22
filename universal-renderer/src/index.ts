import createHandler from "@/handler";
import createStreamHandler from "@/streamHandler";
import type { CreateServerOptions } from "@/types/serverOptions";

/**
 * Creates and configures an SSR server with Bun.
 *
 * @param options Configuration options for the SSR server.
 * @returns A Bun server instance, already configured and ready to be started with server.listen().
 */
export async function createServer<
  TContext extends Record<string, any> = Record<string, any>,
>({ port, ...options }: CreateServerOptions<TContext>): Promise<any> {
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

  const server = Bun.serve({
    port,
    development: import.meta.env.MODE !== "production",

    routes: {
      "/health": () =>
        Response.json({
          status: "OK",
          timestamp: new Date().toISOString(),
        }),
      "/": { POST: handler },
      "/static": { POST: handler },
      "/stream": { POST: streamHandler },
    },

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

  console.log(`[SSR] Server running on http://localhost:${port}`);

  return server;
}
