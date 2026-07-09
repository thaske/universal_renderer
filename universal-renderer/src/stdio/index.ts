import type { SSRHandlerOptions } from "../types";

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

  return async function handleLine(
    line: string,
  ): Promise<string | undefined> {
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
 * Creates a long-lived renderer that reads JSON payloads from stdin, renders the
 * application, and writes a single-line JSON response to stdout.
 *
 * The payload **must** follow the structure `{ url: string, props?: object }`.
 * The response follows `RenderOutput` – `{ head?: string, body: string, body_attrs?: object }`,
 * plus an `error` string when rendering fails.
 *
 * This helper is intended to interoperate with the Ruby stdio adapter, which
 * maintains a small pool of processes and communicates via stdin/stdout.
 */
export async function createRenderer<
  TContext extends Record<string, any> = Record<string, any>,
>(options: StdioOptions<TContext>): Promise<void> {
  const handleLine = createLineHandler(options);

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
      const response = await handleLine(line);
      if (response !== undefined) process.stdout.write(response + "\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    const response = await handleLine(buffer);
    if (response !== undefined) process.stdout.write(response + "\n");
  }
}
