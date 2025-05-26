import type { RequestHandler } from "express";
import { createHealthHandler as createCoreHealthHandler } from "../../core/handlers/health";
import { adaptHandler } from "../adapters";

/**
 * Creates a health check route handler for Express.
 *
 * Returns a simple JSON response indicating the server is running.
 * Useful for load balancers, monitoring systems, and deployment health checks.
 *
 * @returns Express route handler for health checks
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createHealthHandler } from 'universal-renderer/express';
 *
 * const app = express();
 * app.get('/health', createHealthHandler());
 * app.get('/api/status', createHealthHandler()); // Can mount at any path
 * ```
 */
export function createHealthHandler(): RequestHandler {
  const coreHandler = createCoreHealthHandler();
  return adaptHandler(coreHandler);
}
