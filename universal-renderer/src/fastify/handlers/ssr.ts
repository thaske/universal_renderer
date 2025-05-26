import type { FastifyReply, FastifyRequest } from "fastify";
import type { RenderOutput, SSRHandlerOptions } from "../../types";

/**
 * Creates a Server-Side Rendering route handler for Fastify.
 *
 * This handler expects POST requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head?: string, body: string, bodyAttrs?: string }`.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for SSR
 * @returns Fastify route handler for SSR requests
 *
 * @example
 * \`\`\`typescript
 * import fastify from 'fastify';
 * import { createSSRHandler } from 'universal-renderer/fastify';
 * import { renderToString } from 'react-dom/server';
 *
 * const app = fastify();
 *
 * app.post('/render', createSSRHandler({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   render: async (context) => ({
 *     body: renderToString(<App {...context} />)
 *   }),
 *   cleanup: (context) => context.store?.dispose()
 * }));
 * \`\`\`
 */
export function createSSRHandler<TContext extends Record<string, any>>(
  options: SSRHandlerOptions<TContext>,
) {
  if (!options.render) {
    throw new Error("render callback is required");
  }
  if (!options.setup) {
    throw new Error("setup callback is required");
  }

  return async (request: FastifyRequest, reply: FastifyReply) => {
    let context: TContext | undefined;

    try {
      // Fastify already parses the body, so we can access it directly.
      // Ensure the body is an object and contains the url property.
      if (
        typeof request.body !== "object" ||
        request.body === null ||
        !("url" in request.body)
      ) {
        reply
          .status(400)
          .send({ error: "URL string is required in request body" });
        return;
      }

      const { url, props = {} } = request.body as { url: string; props?: any };

      if (typeof url !== "string") {
        reply.status(400).send({ error: "URL string is required" });
        return;
      }

      context = await options.setup(url, props);
      const result: RenderOutput = await options.render(context);

      reply.send(result);
    } catch (error) {
      console.error("[SSR] Fastify Render error:", error);
      reply.status(500).send({ error: "Internal Server Error" });
    } finally {
      if (context && options.cleanup) {
        await options.cleanup(context);
      }
    }
  };
}
