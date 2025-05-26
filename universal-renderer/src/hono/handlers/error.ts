import type { ErrorHandler } from "hono";

/**
 * Creates an error handler for Hono servers.
 *
 * Returns a JSON response with the error message and stack trace.
 *
 * @returns Hono error handler for errors
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createErrorHandler } from 'universal-renderer/hono';
 *
 * const app = new Hono();
 * app.onError(createErrorHandler());
 * ```
 */
export function createErrorHandler(): ErrorHandler {
  return (err, c) => {
    console.error("[SSR] Unhandled error:", err);
    const isDev = process.env.NODE_ENV !== "production";
    c.status(500);
    return c.json({
      error: isDev ? err.message : "Internal Server Error",
      ...(isDev && { stack: err.stack }),
    });
  };
}
