import type { RenderOutput } from "../../types";
import type { BunRequestHandler, BunSSRHandlerOptions } from "../types";

/**
 * Creates a Server-Side Rendering route handler for Bun.
 *
 * This handler expects POST requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head?: string, body: string, bodyAttrs?: string }`.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for SSR
 * @returns Bun route handler for SSR requests
 */
export function createSSRHandler<TContext extends Record<string, any>>(
  options: BunSSRHandlerOptions<TContext>,
): BunRequestHandler {
  const { setup, render, cleanup } = options;

  if (!render) {
    throw new Error("render callback is required for SSRHandler");
  }
  if (!setup) {
    throw new Error("setup callback is required for SSRHandler");
  }

  return async (request: Request): Promise<Response> => {
    let context: TContext | undefined;
    try {
      if (request.method !== "POST") {
        return new Response(
          JSON.stringify({
            error: `Unsupported method: ${request.method}. SSR handler expects POST.`,
          }),
          { status: 405, headers: { "Content-Type": "application/json" } },
        );
      }

      let requestBody;
      try {
        requestBody = await request.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { url, props = {} } = requestBody as {
        url: string;
        props?: Record<string, any>;
      };

      if (!url || typeof url !== "string") {
        return new Response(
          JSON.stringify({
            error: "URL string is required in the request body",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      context = await setup(url, props);
      const output: RenderOutput = await render(context);

      if (cleanup && context) {
        await cleanup(context); // Await if cleanup is async
      }

      return new Response(JSON.stringify(output), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      if (cleanup && context) {
        try {
          await cleanup(context); // Attempt cleanup even on error
        } catch (cleanupError) {
          console.error(
            "[SSR] Error during cleanup after render error:",
            cleanupError,
          );
        }
      }
      console.error("[SSR] Render error:", err);
      // Consistent error response format
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}
