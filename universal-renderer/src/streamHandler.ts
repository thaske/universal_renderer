import type { Request, Response } from "express";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import type { ViteDevServer } from "vite";

import type {
  CoreRenderCallbacks,
  RenderRequestProps,
  SetupResultBase,
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
  TSetupResult extends SetupResultBase = SetupResultBase,
>(
  vite: ViteDevServer,
  callbacks: {
    coreCallbacks: CoreRenderCallbacks<TSetupResult>;
    streamCallbacks: StreamSpecificCallbacks<TSetupResult>;
  },
) {
  const { coreCallbacks, streamCallbacks } = callbacks;

  return async function streamHandler(
    req: Request,
    res: Response,
  ): Promise<void> {
    let setupResult: TSetupResult | undefined;

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

      setupResult = await coreCallbacks.setup(url, props);

      if (!setupResult) {
        console.error("[SSR] setup did not return a result.");

        if (!res.headersSent) {
          res
            .status(500)
            .send(
              "Server Error: Application setup failed to produce a valid result.",
            );
        } else if (!res.writableEnded) {
          res.end();
        }

        return;
      }

      const result = setupResult;

      await streamCallbacks.onResponseStart?.(res, result);

      const stream = renderToPipeableStream(result.jsx, {
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

            await streamCallbacks.onWriteMeta?.(res, result);

            res.write(afterMetaAndBeforeBodyChunk);

            const userTransformStream =
              streamCallbacks.createResponseTransformer?.(result);

            const reactOutputStream = new PassThrough();

            stream.pipe(reactOutputStream);

            if (userTransformStream)
              reactOutputStream.pipe(userTransformStream).pipe(res);
            else reactOutputStream.pipe(res);

            reactOutputStream.on("end", async () => {
              try {
                await streamCallbacks.onBeforeWriteClosingHtml?.(res, result);

                res.end(afterBodyChunk);
              } catch (endError) {
                handleStreamError(
                  "onStreamEnd (writing state/final chunks)",
                  endError,
                  res,
                  result,
                  coreCallbacks,
                );
              }
            });

            reactOutputStream.on("error", (streamError: unknown) => {
              handleStreamError(
                "React render stream or user transform",
                streamError,
                res,
                result,
                coreCallbacks,
              );
            });
          } catch (shellError) {
            handleStreamError(
              "onShellReady",
              shellError,
              res,
              result,
              coreCallbacks,
            );
          }
        },
        onShellError(error: unknown) {
          handleStreamError(
            "onShellError (React)",
            error,
            res,
            result,
            coreCallbacks,
          );
        },
        onError(error: unknown) {
          handleStreamError(
            "onError (React renderToPipeableStream)",
            error,
            res,
            result,
            coreCallbacks,
          );
        },
        bootstrapScripts: [],
      });

      res.on("finish", () => {
        streamCallbacks.onResponseEnd?.(res, result);
        coreCallbacks.cleanup(result);
      });
    } catch (error: unknown) {
      handleGenericError(error, res, vite, setupResult, coreCallbacks);

      if (setupResult) {
        try {
          if (!res.writableEnded) coreCallbacks.cleanup(setupResult);
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
