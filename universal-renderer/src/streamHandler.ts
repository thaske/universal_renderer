import type { Request, Response } from "express";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";

import {
  SSR_MARKERS,
  type BaseCallbacks,
  type RenderRequestProps,
  type StreamSpecificCallbacks,
} from "@/types";

import { handleError } from "@/utils";

// ---------------------------------------------------------------------------
// Internal helpers – kept outside the request handler to keep the hot path
// readable. None of these functions have side-effects besides writing to the
// response they receive.
// ---------------------------------------------------------------------------

type RequestBody = {
  url: string;
  props?: RenderRequestProps;
  template: string;
};

/**
 * Validates the incoming request body and extracts the required fields.
 * Any validation failure is written directly to the response.
 * Returns `undefined` if validation failed.
 */
function parseRequest(
  req: Request,
  res: Response,
): { url: string; props: RenderRequestProps; template: string } | undefined {
  const { url, props = {}, template = "" } = (req.body || {}) as RequestBody;

  if (!url) {
    res.status(400).send("URL is missing in request body.");
    return;
  }

  if (!template.includes(SSR_MARKERS.BODY)) {
    res.status(400).send("HTML template is missing SSR_BODY marker.");
    return;
  }

  if (!template.includes(SSR_MARKERS.META)) {
    // Missing meta marker is not fatal – log a warning and continue.
    console.warn(
      `[SSR] HTML template is missing SSR_META marker (${SSR_MARKERS.META}). Meta content will not be injected.`,
    );
  }

  return { url, props, template };
}

/** Splits the HTML template into head/tail around the BODY marker. */
function splitTemplate(template: string): { head: string; tail: string } {
  const [head, tail] = template.split(SSR_MARKERS.BODY);
  return { head, tail };
}

/** Injects meta tags (if any) into the provided HTML head chunk. */
async function injectMeta<TContext extends Record<string, any>>(
  headChunk: string,
  streamCallbacks: StreamSpecificCallbacks<TContext>,
  context: TContext,
) {
  const metaTags = await streamCallbacks.getMetaTags?.(context);
  return metaTags ? headChunk.replace(SSR_MARKERS.META, metaTags) : headChunk;
}

/**
 * Creates a single-use error responder bound to the given HTTP response.
 * The closure ensures we only ever try to send one error back to the client.
 */
function createErrorResponder<TContext extends Record<string, any>>(
  res: Response,
  templateParts: { head: string; tail: string },
  callbacks: BaseCallbacks<TContext>,
  streamCallbacks: StreamSpecificCallbacks<TContext>,
  getContext: () => TContext | undefined,
) {
  let sent = false;

  return async (errorMessage: string, error: unknown) => {
    if (sent) return;
    sent = true;

    console.error(`[SSR] ${errorMessage}:`, error);
    callbacks.error?.(error as Error, getContext(), errorMessage);

    const ctx = getContext();

    const errorHtml =
      (await callbacks.getErrorContent?.(error, ctx)) ||
      `<template class="ssr-error">Error during rendering: ${String(error)
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</template>`;

    if (res.writableEnded) return; // Client already disconnected.

    const headWithMeta = ctx
      ? await injectMeta(templateParts.head, streamCallbacks, ctx)
      : templateParts.head;

    res.write(headWithMeta);
    res.end(templateParts.tail.replace("</body>", `${errorHtml}\n</body>`));
  };
}

// ---------------------------------------------------------------------------
// Main handler factory
// ---------------------------------------------------------------------------

/**
 * Creates a stream handler for the SSR server.
 *
 * @param callbacks - The callbacks for the stream handler, including framework-specific delegate.
 * @param streamCallbacks - Callbacks specific to the streaming rendering strategy.
 * @returns A function that handles streaming rendering requests.
 */
function createStreamHandler<TContext extends Record<string, any>>({
  callbacks,
  streamCallbacks,
}: {
  callbacks: BaseCallbacks<TContext>;
  streamCallbacks: StreamSpecificCallbacks<TContext>;
}) {
  return async function streamHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    let context: TContext | undefined;

    // ----------------------------------------------------------
    // 1. Validate & parse request
    // ----------------------------------------------------------
    const parsed = parseRequest(req, res);
    if (!parsed) return; // Response already sent.

    const { url, props, template } = parsed;
    const templateParts = splitTemplate(template);

    // Dedicated error responder for **this** request.
    const writeErrorResponse = createErrorResponder(
      res,
      templateParts,
      callbacks,
      streamCallbacks,
      () => context,
    );

    try {
      // --------------------------------------------------------
      // 2. Application setup
      // --------------------------------------------------------
      context = await callbacks.setup(url, props);

      if (!context) {
        await writeErrorResponse(
          "Server setup error",
          new Error("setup did not return a context"),
        );
        return;
      }

      // --------------------------------------------------------
      // 3. React streaming
      // --------------------------------------------------------
      await new Promise<void>((resolve) => {
        const reactNode = streamCallbacks.getReactNode(context!);

        const { pipe } = renderToPipeableStream(reactNode, {
          onShellReady: () => {
            void handleShellReady(resolve);
          },
          onShellError: (err) => {
            void writeErrorResponse("React shell error", err);
          },
          onError: (err) => {
            void writeErrorResponse("React streaming error", err);
          },
        });

        const handleShellReady = async (done: () => void) => {
          try {
            const headWithMeta = await injectMeta(
              templateParts.head,
              streamCallbacks,
              context!,
            );
            res.write(headWithMeta);

            const renderStream = new PassThrough();
            const transform = streamCallbacks.createRenderStreamTransformer?.(
              context!,
            );

            renderStream.on("error", (err) => {
              void writeErrorResponse("Render stream error", err);
            });

            (transform ? renderStream.pipe(transform) : renderStream).pipe(
              res,
              { end: false },
            );

            pipe(renderStream);

            renderStream.on("end", () => {
              const handleEnd = async () => {
                try {
                  await streamCallbacks.onBeforeWriteClosingHtml?.(
                    res,
                    context!,
                  );
                } finally {
                  if (!res.writableEnded) res.end(templateParts.tail);
                  done();
                }
              };
              void handleEnd();
            });
          } catch (err) {
            await writeErrorResponse("onShellReady error", err);
            done();
          }
        };
      });
    } catch (err) {
      handleError(err, res, context, callbacks);
    } finally {
      if (context) {
        try {
          await streamCallbacks.onResponseEnd?.(res, context);
        } finally {
          callbacks.cleanup(context);
        }
      }
    }
  };
}

export default createStreamHandler;
