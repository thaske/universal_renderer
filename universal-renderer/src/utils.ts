import type { Response } from "express";

import type {
  CoreRenderCallbacks,
  LayoutChunks,
  RenderContextBase,
} from "@/types";

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
 * It attempts to fix the stack trace with Vite and sends a 500 response.
 *
 * @param error - The error to handle.
 * @param res - The Express response object.
 * @param context - The render context.
 * @param renderCallbacks - The render callbacks.
 */
export function handleGenericError<
  TContext extends RenderContextBase = RenderContextBase,
>(
  error: Error | unknown,
  res: Response,
  context?: TContext,
  renderCallbacks?: CoreRenderCallbacks<TContext>,
): void {
  if (renderCallbacks?.onError) {
    renderCallbacks.onError(error, context);
  }

  console.error("[SSR] Generic error:", error);

  if (context && renderCallbacks?.cleanup) {
    try {
      renderCallbacks.cleanup(context);
    } catch (cleanupError) {
      console.error(
        "[SSR] Error during cleanup after generic error:",
        cleanupError,
      );
    }
  }

  const errorMessage =
    error instanceof Error ? error.stack || error.message : String(error);

  if (!res.headersSent) {
    res.status(500).send(`<h1>Server Error</h1><pre>${errorMessage}</pre>`);
  } else if (!res.writableEnded) {
    // If headers are sent but stream not ended, try to end it with an error indication if possible,
    // or just destroy.
    res.end("<!-- Server Error -->");
  } else {
    // If response already ended, there's not much to do besides logging.
    // Forcibly destroy might be an option if the connection is still open.
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
 * @param renderCallbacks - The render callbacks.
 */
export function handleStreamError<
  TContext extends RenderContextBase = RenderContextBase,
>(
  errorContext: string,
  error: Error | unknown,
  res: Response,
  renderContext: TContext,
  renderCallbacks: CoreRenderCallbacks<TContext>,
): void {
  if (renderCallbacks.onError) {
    renderCallbacks.onError(error, renderContext, errorContext);
  }

  try {
    renderCallbacks.cleanup(renderContext);
  } catch (cleanupError) {
    console.error(
      "[SSR] Error during cleanup after stream error:",
      cleanupError,
    );
  }

  if (!res.headersSent) {
    res
      .status(500)
      .send(
        `<h1>Streaming Error</h1><p>Error during ${errorContext}. Please check server logs.</p>`,
      );
  } else if (!res.writableEnded) {
    res.end("<!-- Streaming Error -->");
  } else {
    res.destroy();
  }
}
