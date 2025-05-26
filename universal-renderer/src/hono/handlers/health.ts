import type { Context } from "hono";

/**
 * Creates a framework-agnostic health check handler.
 *
 * Returns a simple JSON response indicating the server is running.
 * Useful for load balancers, monitoring systems, and deployment health checks.
 *
 * @returns Framework-agnostic handler for health checks
 *
 * @example
 * ```typescript
 * import { createHealthHandler } from 'universal-renderer/hono';
 *
 * const healthHandler = createHealthHandler();
 * // Use with any framework (Express, Hono, etc.)
 * ```
 */
export function createHealthHandler() {
  return (c: Context) => {
    return c.json({
      status: "OK",
      timestamp: new Date().toISOString(),
    });
  };
}
