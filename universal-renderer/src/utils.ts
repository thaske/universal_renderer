import type { Response } from "express";
import type { ViteDevServer } from "vite";
import type {
  AppSetupResultBase,
  CoreRenderCallbacks,
  LayoutChunks,
  RenderRequestProps,
} from "./types";

/**
 * SSR Markers for HTML template injection during streaming.
 */
export enum SSR_MARKERS {
  META = "<!-- SSR_META -->",
  ROOT = "<!-- SSR_ROOT -->",
  STATE = "<!-- SSR_STATE -->",
}

/**
 * Parses the HTML layout template and extracts the different parts using SSR_MARKERS.
 * The layout is expected to have markers for meta, root, and state injection points.
 */
export function parseLayoutTemplate(
  layout: string,
  metaContent: string
): LayoutChunks {
  const [partBeforeRoot, remainderAfterRoot] = layout.split(SSR_MARKERS.ROOT);

  const headAndInitialContentChunk = partBeforeRoot.replace(
    SSR_MARKERS.META,
    metaContent
  );

  if (remainderAfterRoot === undefined) {
    // This case implies SSR_MARKERS.ROOT was not found or was the last thing in the template.
    // Depending on desired behavior, this could be an error or a specific handling case.
    // For now, assume it means no content after root and no state marker.
    console.warn(
      `[SSR] SSR_MARKERS.ROOT ("${SSR_MARKERS.ROOT}") not found or at the end of the HTML template.`
    );
    return {
      headAndInitialContentChunk,
      divCloseAndStateScriptChunk: "",
      finalHtmlChunk: "",
    };
  }

  const [partBetweenRootAndState, partAfterState] = remainderAfterRoot.split(
    SSR_MARKERS.STATE
  );

  if (partBetweenRootAndState === undefined) {
    console.warn(
      `[SSR] SSR_MARKERS.STATE ("${SSR_MARKERS.STATE}") not found after SSR_MARKERS.ROOT in the HTML template.`
    );
    return {
      headAndInitialContentChunk,
      divCloseAndStateScriptChunk: "", // Or treat remainderAfterRoot as this if STATE is optional for some setups
      finalHtmlChunk: remainderAfterRoot, // Assuming everything after ROOT is final if STATE is missing
    };
  }

  return {
    headAndInitialContentChunk,
    divCloseAndStateScriptChunk: partBetweenRootAndState,
    finalHtmlChunk: partAfterState || "",
  };
}

/**
 * Generic error handler middleware for Express.
 * It attempts to fix the stack trace with Vite and sends a 500 response.
 */
export function handleGenericError<
  TSetupResult extends AppSetupResultBase = AppSetupResultBase,
>(
  error: Error | unknown,
  res: Response,
  vite?: ViteDevServer,
  appSetupResult?: TSetupResult,
  renderCallbacks?: CoreRenderCallbacks<TSetupResult>
): void {
  console.error("[SSR] Generic error:", error);
  if (vite && error instanceof Error) {
    vite.ssrFixStacktrace(error);
  }

  if (appSetupResult && renderCallbacks?.cleanup) {
    try {
      renderCallbacks.cleanup(appSetupResult);
    } catch (cleanupError) {
      console.error(
        "[SSR] Error during cleanup after generic error:",
        cleanupError
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
 */
export function handleStreamError<
  TSetupResult extends AppSetupResultBase = AppSetupResultBase,
>(
  context: string,
  error: Error | unknown,
  res: Response,
  appSetupResult: TSetupResult,
  renderCallbacks: CoreRenderCallbacks<TSetupResult>
): void {
  console.error(`[SSR] ${context} error:`, error);

  try {
    renderCallbacks.cleanup(appSetupResult);
  } catch (cleanupError) {
    console.error(
      "[SSR] Error during cleanup after stream error:",
      cleanupError
    );
  }

  if (!res.headersSent) {
    res
      .status(500)
      .send(
        `<h1>Streaming Error</h1><p>Error during ${context}. Please check server logs.</p>`
      );
  } else if (!res.writableEnded) {
    res.end("<!-- Streaming Error -->");
  } else {
    res.destroy();
  }
}

/**
 * Default HTML template to be used if no htmlTemplatePath is provided and
 * _railsLayoutHtml is not in props. This is a very basic template.
 */
export const DEFAULT_HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${SSR_MARKERS.META}
</head>
<body>
  <div id="root">${SSR_MARKERS.ROOT}</div>
  <script>
    window.__INITIAL_STATE__ = ${SSR_MARKERS.STATE};
  </script>
</body>
</html>
`;

/**
 * Retrieves the HTML template.
 * If `_railsLayoutHtml` is provided in the props, it will be used.
 * Otherwise, it defaults to `DEFAULT_HTML_TEMPLATE`.
 * @param props - Optional rendering request properties that might contain `_railsLayoutHtml`.
 * @returns A promise that resolves to the HTML template string.
 */
export function getHtmlTemplate(props?: RenderRequestProps): string {
  if (props?._railsLayoutHtml) {
    return props._railsLayoutHtml;
  }
  return DEFAULT_HTML_TEMPLATE;
}
