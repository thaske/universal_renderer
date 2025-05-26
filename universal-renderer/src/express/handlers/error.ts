import type { Response } from "express";

/**
 * Creates a framework-agnostic error handler.
 *
 * Returns a JSON response with the error message and stack trace.
 *
 * @returns Framework-agnostic error handler function
 *
 * @example
 * ```typescript
 * import { createErrorHandler } from 'universal-renderer/express';
 *
 * const errorHandler = createErrorHandler();
 * // Use with any framework to handle errors
 * ```
 */
export function createErrorHandler() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (err: Error, res: Response) => {
    console.error("[SSR] Unhandled error:", err);
    const isDev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      error: isDev ? err.message : "Internal Server Error",
      ...(isDev && { stack: err.stack }),
    });
  };
}
