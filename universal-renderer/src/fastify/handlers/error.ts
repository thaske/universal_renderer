import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Creates a Fastify-specific error handler.
 *
 * Returns a JSON response with the error message and stack trace (in dev).
 *
 * @returns Fastify error handler function
 *
 * @example
 * \`\`\`typescript
 * import { createErrorHandler } from 'universal-renderer/fastify';
 * const app = fastify();
 * app.setErrorHandler(createErrorHandler());
 * \`\`\`
 */
export function createErrorHandler() {
  return (error: Error, request: FastifyRequest, reply: FastifyReply) => {
    console.error("[SSR] Fastify Unhandled error:", error);
    const isDev = process.env.NODE_ENV !== "production";
    reply.status(500).send({
      error: isDev ? error.message : "Internal Server Error",
      ...(isDev && { stack: error.stack }),
    });
  };
}
