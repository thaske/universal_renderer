import type { ResponseUtils } from "../../types";

/**
 * Creates an error handler.
 *
 * Returns a JSON response with the error message and stack trace.
 *
 * @returns Error handler function
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
