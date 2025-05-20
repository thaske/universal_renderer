import type { Request, Response } from "express";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";

import type {
  Callbacks,
  RenderContextBase,
  RenderRequestProps,
  StreamSpecificCallbacks,
} from "@/types";

import {
  handleGenericError,
  handleStreamError,
  parseLayoutTemplate,
  SSR_MARKERS,
} from "@/utils";

/**
 * Creates a stream handler for the SSR server.
 *
 * @param callbacks - The callbacks for the stream handler, including framework-specific delegate.
 * @returns A function that handles streaming rendering requests.
 */
function createStreamHandler<
  TContext extends RenderContextBase = RenderContextBase,
>(callbacks: {
  callbacks: Callbacks<TContext>;
  streamCallbacks: StreamSpecificCallbacks<TContext>;
}) {
  const { callbacks, streamCallbacks } = callbacks;

  return async function streamHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    let context: TContext | undefined;

    try {
      const {
        url,
        props = {},
        template = "",
      } = req.body as {
        url: string;
        props: RenderRequestProps;
        template: string;
      };

      if (!url) {
        res.status(400).send("URL is required in the request body.");
        return;
      }

      if (!template.includes(SSR_MARKERS.BODY)) {
        console.error("[SSR] HTML template is missing SSR_BODY marker.");
        res.status(500).send("Server Error: Invalid HTML template.");
        return;
      }

      if (!template.includes(SSR_MARKERS.META)) {
        console.warn(
          `[SSR] HTML template is missing SSR_META marker (${SSR_MARKERS.META}). Meta content will not be injected.`,
        );
      }

      context = await callbacks.setup(url, props);

      if (!context) {
        console.error("[SSR] setup did not return a context.");

        if (!res.headersSent) {
          res
            .status(500)
            .send(
              "Server Error: Application setup failed to produce a valid context.",
            );
        } else if (!res.writableEnded) {
          res.end();
        }

        return;
      }

      await streamCallbacks.onResponseStart?.(res, context);

      const { pipe } = renderToPipeableStream(context.jsx, {
        async onShellReady() {
          if (!res.headersSent) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Transfer-Encoding", "chunked");
          }

          const {
            beforeMetaChunk,
            afterMetaAndBeforeBodyChunk,
            afterBodyChunk,
          } = parseLayoutTemplate(template);

          res.write(beforeMetaChunk);

          await streamCallbacks.onWriteMeta?.(res, context!);

          res.write(afterMetaAndBeforeBodyChunk);

          const userTransformStream =
            streamCallbacks.createRenderStreamTransformer?.(context!);

          const renderOutputStream = new PassThrough();

          renderOutputStream.on("error", (streamError: unknown) => {
            handleStreamError(
              "Application render stream or user transform",
              streamError,
              res,
              context!,
              callbacks,
            );
          });

          const streamEndPromise = new Promise<void>((resolve) => {
            renderOutputStream.on("end", resolve);
          });

          if (userTransformStream) {
            renderOutputStream
              .pipe(userTransformStream)
              .pipe(res, { end: false });
          } else {
            renderOutputStream.pipe(res, { end: false });
          }

          pipe(renderOutputStream);

          await streamEndPromise;

          try {
            await streamCallbacks.onBeforeWriteClosingHtml?.(res, context!);
          } catch (endError) {
            handleStreamError(
              "onBeforeWriteClosingHtml",
              endError,
              res,
              context!,
              callbacks,
            );
          }

          res.end(afterBodyChunk);
        },
        onShellError(error: unknown) {
          handleStreamError("onShellError", error, res, context!, callbacks);
        },
        onError(error: unknown) {
          handleStreamError("onError", error, res, context!, callbacks);
        },
      });

      res.on("finish", () => {
        if (context) {
          streamCallbacks.onResponseEnd?.(res, context);
          callbacks.cleanup(context);
        }
      });
    } catch (error: unknown) {
      handleGenericError(error, res, context, callbacks);

      if (context) {
        try {
          if (!res.writableEnded) callbacks.cleanup(context);
        } catch (cleanupErr) {
          console.error(
            "[SSR] Error during cleanup after generic error:",
            cleanupErr,
          );
        }
      }
    }
  };
}

export default createStreamHandler;
