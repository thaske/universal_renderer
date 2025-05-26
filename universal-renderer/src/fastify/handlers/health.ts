import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Creates a framework-agnostic health check handler for Fastify.
 *
 * Returns a simple JSON response indicating the server is running.
 * Useful for load balancers, monitoring systems, and deployment health checks.
 *
 * @returns Framework-agnostic handler for health checks
 *
 * @example
 * \`\`\`typescript
 * import { createHealthHandler } from 'universal-renderer/fastify';
 *
 * const healthHandler = createHealthHandler();
 * // Use with Fastify
 * \`\`\`
 */
export function createHealthHandler() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: "OK",
      timestamp: new Date().toISOString(),
    });
  };
}
