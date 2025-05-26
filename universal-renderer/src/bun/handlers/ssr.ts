import type { BunRequestHandler, BunSSRHandlerOptions } from "../types";

/**
 * Creates a Server-Side Rendering route handler for Bun.
 *
 * This handler expects POST requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head?: string, body: string, bodyAttrs?: string }`.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for SSR
 * @returns SSR handler
 */
export function createSSRHandler<TContext extends Record<string, any>>(
  options: BunSSRHandlerOptions<TContext>,
): BunRequestHandler {
  const { setup, render, cleanup } = options;

  if (!render) throw new Error("render callback is required for SSRHandler");
  if (!setup) throw new Error("setup callback is required for SSRHandler");

  return async (request: Request): Promise<Response> => {
    let context: TContext | undefined;

    try {
      if (request.method !== "POST")
        throw new Error(
          `Unsupported method: ${request.method}. SSR handler expects POST.`,
        );

      const requestBody = (await request.json()) as {
        url: string;
        props?: Record<string, any>;
      };

      if (!requestBody.url || typeof requestBody.url !== "string")
        throw new Error("URL string is required in the request body");

      context = await setup(requestBody.url, requestBody.props ?? {});
      const output = await render(context);

      return new Response(JSON.stringify(output), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[SSR] Render error:", err);
      throw err;
    } finally {
      if (context) await cleanup?.(context);
    }
  };
}
