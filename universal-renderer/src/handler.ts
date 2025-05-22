import type { Callbacks } from "@/types/callbacks";
import type { Props } from "@/types/internal";

/**
 * Request body expected by the JSON-based handler.
 */
type RequestBody = {
  url?: string;
  props?: Props;
};

/**
 * Creates a handler for JSON-based rendering.
 *
 * @param callbacks - The callbacks to use for the handler.
 * @returns A handler function that can be used to render a JSON response.
 */
export default function createHandler<TContext extends Record<string, any>>({
  callbacks,
}: {
  callbacks: Callbacks<TContext>;
}) {
  return async function handler(req: Request): Promise<Response> {
    let context: TContext | undefined;

    try {
      const body = (await req.json().catch(() => ({}))) as RequestBody;
      const { url, props = {} } = body;

      if (!url) {
        return Response.json(
          { error: "URL is required in the request body." },
          { status: 400 },
        );
      }

      context = await callbacks.setup(url, props);

      if (!context) {
        return Response.json(
          {
            error:
              "Server Error: Application setup failed to produce a valid context.",
          },
          { status: 500 },
        );
      }

      if (!callbacks.render) {
        return Response.json(
          {
            error:
              "Rendering is not configured on the server (callbacks.render missing).",
          },
          { status: 500 },
        );
      }

      const renderResult = await callbacks.render(context);
      return Response.json(renderResult);
    } catch (error) {
      console.error("[SSR] Render error:", error);
      return new Response("", { status: 500 });
    } finally {
      if (context) {
        callbacks.cleanup(context);
      }
    }
  };
}
