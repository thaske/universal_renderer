import type { Response } from "express";

import type { BaseCallbacks, LayoutChunks } from "@/types";

/**
 * SSR Markers for HTML template injection during streaming.
 */
export enum SSR_MARKERS {
  META = "<!-- SSR_META -->",
  BODY = "<!-- SSR_BODY -->",
}

/**
 * Parses the HTML layout template and extracts the different parts using SSR_MARKERS.
 * The layout is expected to have markers for meta and body injection points.
 *
 * @param layout - The HTML layout template.
 * @returns The parsed layout chunks.
 */
export function parseLayoutTemplate(layout: string): LayoutChunks {
  const [beforeMetaChunk, afterMetaChunk] = layout.split(SSR_MARKERS.META);
  const [afterMetaAndBeforeBodyChunk, afterBodyChunk] = afterMetaChunk.split(
    SSR_MARKERS.BODY,
  );

  return {
    beforeMetaChunk,
    afterMetaAndBeforeBodyChunk,
    afterBodyChunk,
  };
}

/**
 * Generic error handler middleware for Express.
 *
 * @param error - The error to handle.
 * @param res - The Express response object.
 * @param context - The render context.
 * @param callbacks - The render callbacks.
 */
export function handleGenericError<
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

/**
 * Handles errors that occur within a stream, ensuring resources are cleaned up.
 *
 * @param context - The context in which the error occured in.
 * @param error - The error to handle.
 * @param res - The Express response object.
 * @param renderContext - The render context.
 * @param callbacks - The render callbacks.
 */
export function handleStreamError<
  TContext extends Record<string, any> = Record<string, any>,
>(
  errorContext: string,
  error: Error | unknown,
  res: Response,
  renderContext: TContext,
  callbacks: BaseCallbacks<TContext>,
): void {
  if (callbacks.error) callbacks.error(error, renderContext, errorContext);
  console.error(`[SSR] Stream error in ${errorContext}:`, error);

  try {
    callbacks.cleanup(renderContext);
  } catch (cleanupError) {
    console.error(
      "[SSR] Error during cleanup after stream error:",
      cleanupError,
    );
  }

  // Silently end the response without sending error content
  // to allow Rails to detect the failure and fallback gracefully
  if (!res.writableEnded) {
    res.end();
  } else {
    res.destroy();
  }
}
