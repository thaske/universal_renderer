import type { BunErrorHandler } from "../types";

/**
 * Creates an error handler.
 *
 * Returns a JSON response with the error message and stack trace.
 *
 * @returns Error handler function
 */
export function createErrorHandler(): BunErrorHandler {
  return (err: Error) => {
    console.error("[SSR] Unhandled error:", err);
    const isDev = process.env.NODE_ENV !== "production";
    return new Response(
      JSON.stringify({
        error: isDev ? err.message : "Internal Server Error",
        ...(isDev && { stack: err.stack }),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
}
