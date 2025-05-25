import type { RequestHandler } from "express";

/**
 * Creates a health check route handler.
 *
 * Returns a simple JSON response indicating the server is running.
 * Useful for load balancers, monitoring systems, and deployment health checks.
 *
 * @returns Express route handler for health checks
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createHealthHandler } from 'universal-renderer';
 *
 * const app = express();
 * app.get('/health', createHealthHandler());
 * app.get('/api/status', createHealthHandler()); // Can mount at any path
 * ```
 */
export function createHealthHandler(): RequestHandler {
  return (req, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
    });
  };
}
