import type { ResponseUtils } from "../../types";

/**
 * Creates a framework-agnostic error handler.
 *
 * Returns a JSON response with the error message and stack trace.
 *
 * @returns Framework-agnostic error handler function
 *
 * @example
 * ```typescript
 * import { createErrorHandler } from 'universal-renderer/bun';
 *
 * const errorHandler = createErrorHandler();
 * // Use with any framework to handle errors
 * ```
 */
export function createErrorHandler() {
  return (err: Error, res: ResponseUtils) => {
    console.error("[SSR] Unhandled error:", err);
    const isDev = process.env.NODE_ENV !== "production";
    res.json(
      {
        error: isDev ? err.message : "Internal Server Error",
        ...(isDev && { stack: err.stack }),
      },
      500,
    );
  };
}
