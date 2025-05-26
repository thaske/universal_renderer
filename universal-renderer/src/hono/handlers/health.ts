import type { Handler } from "hono";
import { createHealthHandler as createCoreHealthHandler } from "../../core/handlers/health";
import { adaptHandler } from "../adapters";

/**
 * Creates a health check route handler for Hono.
 *
 * Returns a simple JSON response indicating the server is running.
 * Useful for load balancers, monitoring systems, and deployment health checks.
 *
 * @returns Hono route handler for health checks
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createHealthHandler } from 'universal-renderer/hono';
 *
 * const app = new Hono();
 * app.get('/health', createHealthHandler());
 * app.get('/api/status', createHealthHandler()); // Can mount at any path
 * ```
 */
export function createHealthHandler(): Handler {
  const coreHandler = createCoreHealthHandler();
  return adaptHandler(coreHandler);
}
