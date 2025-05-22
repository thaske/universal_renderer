import type { Response } from "express";

import type { BaseCallbacks } from "@/types";

/**
 * Generic error handler middleware for Express.
 *
 * @param error - The error to handle.
 * @param res - The Express response object.
 * @param context - The render context.
 * @param callbacks - The render callbacks.
 */
export function handleError<
  TContext extends Record<string, any> = Record<string, any>,
>(
  error: Error | unknown,
  res: Response,
  context?: TContext,
  callbacks?: BaseCallbacks<TContext>,
): void {
  if (callbacks?.error) {
    callbacks.error(error, context);
  }

  console.error("[SSR] Generic error:", error);

  if (context && callbacks?.cleanup) {
    try {
      callbacks.cleanup(context);
    } catch (cleanupError) {
      console.error(
        "[SSR] Error during cleanup after generic error:",
        cleanupError,
      );
    }
  }

  // Silently close the connection without sending error response
  // to allow Rails to fallback to regular rendering
  if (!res.writableEnded) {
    res.end();
  } else {
    res.destroy();
  }
}
