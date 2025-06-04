// Bun handlers operate directly with the standard Request/Response primitives
// rather than the framework-agnostic helpers used by other implementations.
import type { BunRequestHandler } from "../types";

/**
 * Creates a health check handler.
 *
 * Returns a simple JSON response indicating the server is running.
 * Useful for load balancers, monitoring systems, and deployment health checks.
 *
 * @returns Health check handler
 */
export function createHealthHandler(): BunRequestHandler {
  return async () =>
    new Response(
      JSON.stringify({
        status: "OK",
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
}
