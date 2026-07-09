import { PassThrough } from "node:stream";

import type { ReactNode } from "react";
import { SSR_MARKERS } from "../constants";
import type { SSRHandlerOptions, StreamHandlerOptions } from "../types";

/**
 * Options for the stdio renderer which communicates over stdin/stdout.
 */
export type StdioOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = SSRHandlerOptions<TContext> & {
  /**
   * Optional error handler invoked when JSON parsing, rendering, or cleanup fails.
   */
  error?: (err: Error) => void | Promise<void>;

  /**
   * Optional streaming callbacks for React 18+ streaming SSR.
   * When provided, requests that include a `template` are answered with a
   * sequence of `{ chunk }` frames terminated by `{ done: true }` instead of
   * a single response line.
   */
  streamCallbacks?: StreamHandlerOptions<TContext>["streamCallbacks"];
};

/**
 * A parsed stdio request. Requests carrying a `template` are streaming
 * requests; all others are static renders.
 */
type StdioRequest = {
  url?: string;
  props?: Record<string, any>;
  template?: string;
};

/**
 * Builds the per-line request handler used by {@link createRenderer}.
 *
 * Takes one raw request line and returns the single-line JSON response to
 * write to stdout, or `undefined` for blank input. Every non-blank line
 * produces exactly one response line — including malformed JSON — so the
 * Ruby adapter never has to wait out a timeout to learn a request failed.
 *
 * Exported for testing; production code should use {@link createRenderer}.
 */
export function createLineHandler<
  TContext extends Record<string, any> = Record<string, any>,
>(options: StdioOptions<TContext>) {
  const { setup, render, cleanup, error: onError } = options;

  if (!setup) throw new Error("setup callback is required");
  if (!render) throw new Error("render callback is required");

  return async function handleLine(line: string): Promise<string | undefined> {
    const trimmed = line.trim();
    if (!trimmed) return undefined;

    let payload: { url: string; props?: Record<string, any> };
    try {
      payload = JSON.parse(trimmed);
    } catch (err: any) {
      console.error("[universal-renderer] Invalid JSON payload", err);
      await onError?.(err);
      return JSON.stringify({
        head: "",
        body: "",
        body_attrs: {},
        error: `Invalid JSON payload: ${err.message}`,
      });
    }

    let context: TContext | undefined;

    try {
      context = await setup(payload.url, payload.props ?? {});
      const output = await render(context);

      return JSON.stringify({
        head: output.head ?? "",
        body: output.body,
        body_attrs: output.bodyAttrs ?? {},
      });
    } catch (err: any) {
      console.error("[universal-renderer] Render error", err);
      await onError?.(err);
      return JSON.stringify({
        head: "",
        body: "",
        body_attrs: {},
        error: err.message,
      });
    } finally {
      if (context && cleanup) {
        try {
          await cleanup(context);
        } catch (err: any) {
          console.error("[universal-renderer] Cleanup error", err);
          await onError?.(err);
        }
      }
    }
  };
}

/**
 * Builds the streaming request handler used by {@link createRenderer}.
 *
 * Takes a parsed streaming request (`{ url, props?, template }`) and a `write`
 * function for emitting single-line JSON frames. The template's body marker is
 * split into head/tail; the head (with the head marker replaced) is emitted
 * first, React chunks follow as they render, then the tail and a terminal
 * `{ done: true }` frame. Failures emit a terminal `{ error }` frame instead,
 * so the Ruby adapter always receives exactly one terminal frame and the
 * protocol stream stays synchronized.
 *
 * Exported for testing; production code should use {@link createRenderer}.
 */
export function createStreamLineHandler<
  TContext extends Record<string, any> = Record<string, any>,
>(options: StdioOptions<TContext>) {
  const { setup, cleanup, streamCallbacks, error: onError } = options;

  if (!setup) throw new Error("setup callback is required");
  if (!streamCallbacks)
    throw new Error("streamCallbacks are required for streaming");

  return async function handleStreamRequest(
    payload: StdioRequest,
    write: (line: string) => void,
  ): Promise<void> {
    let context: TContext | undefined;

    try {
      const { url, props = {}, template = "" } = payload;

      if (!url) throw new Error("URL is required");
      if (!template.includes(SSR_MARKERS.BODY)) {
        throw new Error(`Template missing ${SSR_MARKERS.BODY} marker`);
      }

      context = await setup(url, props);

      let reactNode: ReactNode;
      if (streamCallbacks.node) {
        reactNode = streamCallbacks.node(context);
      } else if ("app" in context) {
        reactNode = (context as any).app;
      } else if ("jsx" in context) {
        reactNode = (context as any).jsx;
      } else {
        throw new Error("No app callback provided");
      }

      // Imported lazily so stdio renderers that never stream don't need
      // react-dom installed at all.
      const { renderToPipeableStream } = await import("react-dom/server.node");

      const [head = "", tail = ""] = template.split(SSR_MARKERS.BODY);

      await new Promise<void>((resolve) => {
        let settled = false;

        const fail = (err: any) => {
          if (settled) return;
          settled = true;
          console.error("[universal-renderer] Stream shell error", err);
          void onError?.(err);
          write(JSON.stringify({ error: err?.message ?? String(err) }));
          resolve();
        };

        const { pipe } = renderToPipeableStream(reactNode, {
          async onShellReady() {
            try {
              const finalHead = await streamCallbacks.head?.(context!);
              write(
                JSON.stringify({
                  chunk: head.replace(SSR_MARKERS.HEAD, finalHead ?? ""),
                }),
              );

              const stream = new PassThrough();
              const transform = streamCallbacks.transform?.(context!);

              // Watch the end of the pipeline, not the source: with a
              // transform, the PassThrough can end while the transform still
              // holds buffered output, and emitting the tail then would
              // interleave it into the body.
              const output = transform ? stream.pipe(transform) : stream;

              output.on("data", (chunk: Buffer) => {
                write(JSON.stringify({ chunk: chunk.toString() }));
              });
              output.on("error", fail);
              output.on("end", () => {
                if (settled) return;
                settled = true;
                write(JSON.stringify({ chunk: tail }));
                write(JSON.stringify({ done: true }));
                resolve();
              });

              pipe(stream);
            } catch (err) {
              fail(err);
            }
          },
          onShellError: fail,
          onError(err: unknown) {
            // Post-shell errors: React falls back to client rendering for the
            // failed boundary and the stream still completes normally.
            console.error("[universal-renderer] Stream error", err);
            void onError?.(err as Error);
          },
        });
      });
    } catch (err: any) {
      console.error("[universal-renderer] Stream render error", err);
      await onError?.(err);
      write(JSON.stringify({ error: err?.message ?? String(err) }));
    } finally {
      if (context && cleanup) {
        try {
          await cleanup(context);
        } catch (err: any) {
          console.error("[universal-renderer] Cleanup error", err);
          await onError?.(err);
        }
      }
    }
  };
}

/**
 * Creates a long-lived renderer that reads JSON payloads from stdin, renders the
 * application, and writes a single-line JSON response to stdout.
 *
 * The payload **must** follow the structure `{ url: string, props?: object, template?: string }`.
 * For static requests the response follows `RenderOutput` –
 * `{ head?: string, body: string, body_attrs?: object }`, plus an `error`
 * string when rendering fails. Requests that include a `template` (and when
 * `streamCallbacks` are configured) are answered with a sequence of
 * `{ chunk: string }` frames terminated by `{ done: true }` or `{ error }`.
 *
 * This helper is intended to interoperate with the Ruby stdio adapter, which
 * maintains a small pool of processes and communicates via stdin/stdout.
 */
export async function createRenderer<
  TContext extends Record<string, any> = Record<string, any>,
>(options: StdioOptions<TContext>): Promise<void> {
  const handleLine = createLineHandler(options);
  const handleStreamRequest = options.streamCallbacks
    ? createStreamLineHandler(options)
    : undefined;

  const writeLine = (line: string) => process.stdout.write(line + "\n");

  // Streaming requests are detected by the presence of a `template`, which
  // requires a parse. Static requests then re-parse inside handleLine — an
  // acceptable cost to keep createLineHandler's public line-in/line-out
  // contract intact.
  async function dispatch(line: string): Promise<void> {
    if (handleStreamRequest) {
      let payload: StdioRequest | undefined;
      try {
        payload = JSON.parse(line);
      } catch {
        // Malformed JSON falls through to handleLine, which owns the
        // in-band error response for unparseable lines.
      }
      if (payload && typeof payload.template === "string") {
        await handleStreamRequest(payload, writeLine);
        return;
      }
    }

    const response = await handleLine(line);
    if (response !== undefined) writeLine(response);
  }

  // stdout is the protocol channel: one response line per request line.
  // App code (or its dependencies) calling console.log would inject frames
  // into that stream and desynchronize the Ruby adapter, so route it to
  // stderr, which the Ruby side drains into the Rails log.
  console.log = (...args: unknown[]) => console.error(...args);

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of process.stdin) {
    // stream: true holds back multibyte sequences split across chunks;
    // large payloads always span multiple pipe reads.
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });

    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      await dispatch(line);
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    await dispatch(buffer);
  }
}
