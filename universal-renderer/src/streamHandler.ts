import type { Request, Response } from "express";
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import type { ViteDevServer } from "vite";

import type {
  AppSetupResultBase,
  CoreRenderCallbacks,
  RenderRequestProps,
  StreamSpecificCallbacks,
} from "./types";

import {
  getHtmlTemplate,
  handleGenericError,
  handleStreamError,
  parseLayoutTemplate,
  SSR_MARKERS,
} from "./utils";

function createStreamHandler<
  TSetupResult extends AppSetupResultBase = AppSetupResultBase,
>(
  vite: ViteDevServer,
  callbacks: {
    coreCallbacks: CoreRenderCallbacks<TSetupResult>;
    streamCallbacks: StreamSpecificCallbacks<TSetupResult>;
  }
) {
  const { coreCallbacks, streamCallbacks } = callbacks;

  return async function streamHandler(
    req: Request,
    res: Response
  ): Promise<void> {
    let resultFromSetup: TSetupResult | undefined;

    try {
      const { url, props = {} } = req.body as {
        url: string;
        props: RenderRequestProps;
      };

      if (!url) {
        res.status(400).send("URL is required in the request body.");
        return;
      }

      const htmlTemplate = getHtmlTemplate(props);

      if (!htmlTemplate.includes(SSR_MARKERS.ROOT)) {
        console.error("[SSR] HTML template is missing SSR_ROOT marker.");
        res.status(500).send("Server Error: Invalid HTML template.");
        return;
      }

      if (!htmlTemplate.includes(SSR_MARKERS.META)) {
        console.warn(
          `[SSR] HTML template is missing SSR_META marker (${SSR_MARKERS.META}). Meta content will not be injected by parseLayoutTemplate.`
        );
      }

      if (!htmlTemplate.includes(SSR_MARKERS.STATE)) {
        console.warn(
          `[SSR] HTML template is missing SSR_STATE marker (${SSR_MARKERS.STATE}). State will not be injected by parseLayoutTemplate.`
        );
      }

      resultFromSetup = await coreCallbacks.setup(url, props);

      if (!resultFromSetup) {
        console.error("[SSR] setup did not return a result.");
        if (!res.headersSent) {
          res
            .status(500)
            .send(
              "Server Error: Application setup failed to produce a valid result."
            );
        } else if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      const result = resultFromSetup;

      const shellContext =
        (await streamCallbacks.getShellContext?.(result)) || {};
      const { meta = "", state } = shellContext;

      await streamCallbacks.onResponseStart?.(res, result, shellContext);

      const { pipe } = renderToPipeableStream(result.jsx, {
        onShellReady: async () => {
          try {
            if (!res.headersSent) {
              res.statusCode = 200;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.setHeader("Transfer-Encoding", "chunked");
            }

            const {
              headAndInitialContentChunk,
              divCloseAndStateScriptChunk: rawDivCloseAndStateScriptChunk,
              finalHtmlChunk: rawFinalHtmlChunk,
            } = parseLayoutTemplate(htmlTemplate, meta);

            res.write(headAndInitialContentChunk);

            let streamToPipe: NodeJS.WritableStream = res;
            const userTransformStream =
              streamCallbacks.createResponseTransformer?.(result);

            const reactOutputRelay = new PassThrough();
            pipe(reactOutputRelay);

            if (userTransformStream) {
              streamToPipe = userTransformStream;
              reactOutputRelay.pipe(userTransformStream).pipe(res);
            } else {
              reactOutputRelay.pipe(res);
            }

            reactOutputRelay.on("end", async () => {
              try {
                await streamCallbacks.onBeforeWriteClosingHtml?.(
                  res,
                  result,
                  shellContext
                );

                res.write(rawDivCloseAndStateScriptChunk);
                if (state !== undefined) {
                  if (htmlTemplate.includes(SSR_MARKERS.STATE)) {
                    res.write(JSON.stringify(state));
                  } else {
                    console.warn(
                      "[SSR] State was provided, but SSR_STATE marker is missing in HTML template. State will not be injected."
                    );
                  }
                }
                res.end(rawFinalHtmlChunk);
              } catch (endError) {
                handleStreamError(
                  "onStreamEnd (writing state/final chunks)",
                  endError,
                  res,
                  result,
                  coreCallbacks
                );
              }
            });

            reactOutputRelay.on("error", (streamError) => {
              handleStreamError(
                "React render stream or user transform",
                streamError,
                res,
                result,
                coreCallbacks
              );
            });
          } catch (shellError) {
            handleStreamError(
              "onShellReady",
              shellError,
              res,
              result,
              coreCallbacks
            );
          }
        },
        onShellError: (error: unknown) => {
          handleStreamError(
            "onShellError (React)",
            error,
            res,
            result,
            coreCallbacks
          );
        },
        onError: (error: unknown) => {
          handleStreamError(
            "onError (React renderToPipeableStream)",
            error,
            res,
            result,
            coreCallbacks
          );
        },
        bootstrapScripts: [],
      });

      res.on("finish", () => {
        streamCallbacks.onResponseEnd?.(res, result);
        coreCallbacks.cleanup(result);
      });
    } catch (error: unknown) {
      const currentResult = resultFromSetup;
      handleGenericError(error, res, vite, currentResult, coreCallbacks);
      if (currentResult) {
        try {
          if (!res.writableEnded) {
            coreCallbacks.cleanup(currentResult);
          }
        } catch (cleanupErr) {
          console.error(
            "[SSR] Error during cleanup after generic error:",
            cleanupErr
          );
        }
      }
    }
  };
}

export default createStreamHandler;
