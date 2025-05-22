import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";

import { type Callbacks, type StreamCallbacks } from "@/types/callbacks";
import { SSR_MARKERS, type Props } from "@/types/internal";

type RequestBody = {
  url?: string;
  props?: Props;
  template?: string;
};

/**
 * Validates the incoming request body and extracts the required fields.
 * Returns a Response (error) when validation fails so the caller can early-return.
 */
function parseRequest(
  body: RequestBody,
): { url: string; props: Props; template: string } | Response {
  const { url, props = {}, template = "" } = body;

  if (!url) {
    return Response.json(
      { error: "URL is missing in request body." },
      {
        status: 400,
      },
    );
  }

  if (!template.includes(SSR_MARKERS.BODY)) {
    return new Response("HTML template is missing SSR_BODY marker.", {
      status: 400,
    });
  }

  if (!template.includes(SSR_MARKERS.HEAD)) {
    console.warn(
      `[SSR] HTML template is missing SSR_HEAD marker (${SSR_MARKERS.HEAD}). Head content will not be injected.`,
    );
  }

  return { url, props, template } as const;
}

/** Splits the HTML template into head/tail around the BODY marker. */
function splitTemplate(template: string): { head: string; tail: string } {
  const [head, tail] = template.split(SSR_MARKERS.BODY);
  return { head, tail };
}

/** Injects tags (if any) into the provided HTML head chunk. */
async function injectHead<TContext extends Record<string, any>>(
  headChunk: string,
  streamCallbacks: StreamCallbacks<TContext>,
  context: TContext,
) {
  const headTags = await streamCallbacks.head?.(context);
  return headTags ? headChunk.replace(SSR_MARKERS.HEAD, headTags) : headChunk;
}

/**
 * Creates an error responder bound to the given output stream. Ensures we only
 * ever write one error back to the client.
 */
function createErrorResponder<TContext extends Record<string, any>>(
  out: PassThrough,
  templateParts: { head: string; tail: string },
  callbacks: Callbacks<TContext>,
  streamCallbacks: StreamCallbacks<TContext>,
  getContext: () => TContext | undefined,
) {
  let sent = false;

  return async (errorMessage: string, error: unknown) => {
    if (sent) return;
    sent = true;

    console.error(`[SSR] ${errorMessage}:`, error);
    // Callbacks may optionally implement custom error handling helpers – keep
    // the casts loose to preserve backwards-compat with existing typings.
    (callbacks as any).error?.(error as Error, getContext?.(), errorMessage);

    const ctx = getContext();

    const errorHtml =
      (await (callbacks as any).getErrorContent?.(error, ctx)) ||
      `<template data-ssr-error>Error during rendering: ${String(error)
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</template>`;

    const headWithTags = ctx
      ? await injectHead(templateParts.head, streamCallbacks, ctx)
      : templateParts.head;

    try {
      out.write(headWithTags);
      out.end(templateParts.tail.replace("</body>", `${errorHtml}\n</body>`));
    } catch {
      /* no-op – client likely disconnected */
    }
  };
}

/**
 * Creates a handler for streaming HTML rendering.
 *
 * @param callbacks - The callbacks to use for the handler.
 * @param streamCallbacks - Optional streaming-specific callbacks.
 * @returns A handler function that can be used to render a streaming HTML response.
 */
export default function createStreamHandler<
  TContext extends Record<string, any>,
>({
  callbacks,
  streamCallbacks,
}: {
  callbacks: Callbacks<TContext>;
  streamCallbacks?: StreamCallbacks<TContext>;
}) {
  if (!streamCallbacks) {
    throw new Error("streamCallbacks is required");
  }

  return async function streamHandler(req: Request): Promise<Response> {
    // 0. Attempt to parse JSON body – fall back to empty object on failure.
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const parsed = parseRequest(body);
    if (parsed instanceof Response) return parsed; // Early-exit on validation error.

    const { url, props, template } = parsed;
    const templateParts = splitTemplate(template);

    let context: TContext | undefined;

    // We'll create the output stream upfront so we can immediately return the
    // Response object - Bun will continue streaming chunks as we write them.
    const outStream = new PassThrough();
    const response = new Response(outStream as any, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });

    // Dedicated error responder for *this* request.
    const writeError = createErrorResponder(
      outStream,
      templateParts,
      callbacks,
      streamCallbacks,
      () => context,
    );

    (async () => {
      try {
        // 1. Application setup
        context = await callbacks.setup(url, props);
        if (!context) {
          await writeError(
            "Server setup error",
            new Error("setup did not return a context"),
          );
          return;
        }

        // 2. Begin React streaming – defer shell until ready.
        await new Promise<void>((resolveShell) => {
          let reactNode;
          if (streamCallbacks.app) {
            reactNode = streamCallbacks.app(context!);
          } else if (context && "app" in context) {
            reactNode = context.app;
          } else if (context && "jsx" in context) {
            reactNode = context.jsx;
          } else {
            throw new Error("No app callback provided");
          }

          const { pipe } = renderToPipeableStream(reactNode, {
            onShellReady: () => void handleShellReady(resolveShell),
            onShellError: (err) => void writeError("React shell error", err),
            onError: (err) => void writeError("React streaming error", err),
          });

          const handleShellReady = async (done: () => void) => {
            try {
              const headWithTags = await injectHead(
                templateParts.head,
                streamCallbacks,
                context!,
              );
              outStream.write(headWithTags);

              const passThroughStream = new PassThrough();
              const transform = streamCallbacks.transform?.(context!);

              passThroughStream.on(
                "error",
                (err) => void writeError("Render stream error", err),
              );

              (transform
                ? passThroughStream.pipe(transform)
                : passThroughStream
              ).pipe(outStream, { end: false });

              pipe(passThroughStream);

              passThroughStream.on("end", () => {
                const handleEnd = async () => {
                  try {
                    await streamCallbacks.close?.(
                      outStream as unknown as any,
                      context!,
                    );
                  } finally {
                    if (!outStream.writableEnded)
                      outStream.end(templateParts.tail);
                    done();
                  }
                };
                void handleEnd();
              });
            } catch (err) {
              await writeError("onShellReady error", err);
              done();
            }
          };
        });
      } catch (err) {
        await writeError("Unexpected server error", err as Error);
      } finally {
        if (context) {
          callbacks.cleanup(context);
        }
      }
    })();

    return response;
  };
}
