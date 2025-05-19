import type { Request, Response } from "express";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import type { ViteDevServer } from "vite";

import type {
  CoreRenderCallbacks,
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
 * @param vite - The Vite dev server instance.
 * @param callbacks - The callbacks for the stream handler.
 * @returns A function that handles streaming rendering requests.
 */
function createStreamHandler<
  TContext extends RenderContextBase = RenderContextBase,
>(
  vite: ViteDevServer,
  callbacks: {
    coreCallbacks: CoreRenderCallbacks<TContext>;
    streamCallbacks: StreamSpecificCallbacks<TContext>;
  },
) {
  const { coreCallbacks, streamCallbacks } = callbacks;

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

      context = await coreCallbacks.setup(url, props);

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
          try {
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
              streamCallbacks.createResponseTransformer?.(context!);

            const reactOutputStream = new PassThrough();

            // Setup stream error handling
            reactOutputStream.on("error", (streamError: unknown) => {
              handleStreamError(
                "React render stream or user transform",
                streamError,
                res,
                context!,
                coreCallbacks,
              );
            });

            // Create a promise that resolves when the stream ends
            const streamEndPromise = new Promise<void>((resolve) => {
              reactOutputStream.on("end", resolve);
            });

            // Pipe React stream but don't end response yet
            if (userTransformStream) {
              reactOutputStream
                .pipe(userTransformStream)
                .pipe(res, { end: false });
            } else {
              reactOutputStream.pipe(res, { end: false });
            }

            // Start the React streaming
            pipe(reactOutputStream);

            // Wait for React content to be fully streamed
            await streamEndPromise;

            try {
              await streamCallbacks.onBeforeWriteClosingHtml?.(res, context!);
            } catch (endError) {
              handleStreamError(
                "onBeforeWriteClosingHtml",
                endError,
                res,
                context!,
                coreCallbacks,
              );
            }

            try {
              res.end(afterBodyChunk);
            } catch (endError) {
              handleStreamError(
                "onStreamEnd (writing state/final chunks)",
                endError,
                res,
                context!,
                coreCallbacks,
              );
            }
          } catch (shellError) {
            handleStreamError(
              "onShellReady",
              shellError,
              res,
              context!,
              coreCallbacks,
            );
          }
        },
        onShellError(error: unknown) {
          handleStreamError(
            "onShellError (React)",
            error,
            res,
            context!,
            coreCallbacks,
          );
        },
        onError(error: unknown) {
          handleStreamError(
            "onError (React renderToPipeableStream)",
            error,
            res,
            context!,
            coreCallbacks,
          );
        },
        bootstrapScripts: [],
      });

      res.on("finish", () => {
        if (context) {
          streamCallbacks.onResponseEnd?.(res, context);
          coreCallbacks.cleanup(context);
        }
      });
    } catch (error: unknown) {
      handleGenericError(error, res, context, coreCallbacks);

      if (context) {
        try {
          if (!res.writableEnded) coreCallbacks.cleanup(context);
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
