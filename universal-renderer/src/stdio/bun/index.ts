import type { RenderOutput, SSRHandlerOptions } from "../../types";

/**
 * Options for the stdio Bun renderer which communicates over stdin/stdout.
 */
export type BunStdioOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = SSRHandlerOptions<TContext> & {
  /**
   * Optional error handler invoked when JSON parsing, rendering, or cleanup fails.
   */
  error?: (err: Error) => void | Promise<void>;
};

/**
 * Creates a long-lived renderer that reads JSON payloads from stdin, renders the
 * application, and writes a single-line JSON response to stdout.
 *
 * The payload **must** follow the structure `{ url: string, props?: object }`.
 * The response follows `RenderOutput` – `{ head?: string, body: string, bodyAttrs?: string }`.
 *
 * This helper is intended to interoperate with the Ruby adapter
 * `UniversalRenderer::Adapter::BunIo`, which maintains a small pool of
 * Bun processes and communicates via stdio.
 */
export async function createRenderer<
  TContext extends Record<string, any> = Record<string, any>,
>(options: BunStdioOptions<TContext>): Promise<void> {
  const { setup, render, cleanup, error: onError } = options;

  if (!setup) throw new Error("setup callback is required");
  if (!render) throw new Error("render callback is required");

  const decoder = new TextDecoder();
  let buffer = "";

  async function handleLine(line: string = ""): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    let payload: { url: string; props?: Record<string, any> };
    try {
      payload = JSON.parse(trimmed);
    } catch (err: any) {
      console.error("[universal-renderer] Invalid JSON payload", err);
      await onError?.(err);
      return;
    }

    let context: TContext | undefined;

    try {
      context = await setup(payload.url, payload.props ?? {});
      const output = await render(context);

      // Ensure a consistent structure for the Ruby side.
      const response: RenderOutput = {
        head: output.head ?? "",
        body: output.body,
        bodyAttrs: output.bodyAttrs ?? "",
      };

      // Write as a single-line JSON string so the Ruby process can readline().
      console.log(JSON.stringify(response));
    } catch (err: any) {
      console.error("[universal-renderer] Render error", err);
      await onError?.(err);
      console.log(
        JSON.stringify({ head: "", body: "", bodyAttrs: "", error: err.message }),
      );
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
  }

  // Consume stdin stream line by line (\n-delimited JSON).
  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk);

    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      await handleLine(line);
    }
  }

  // Flush any trailing data when EOF is reached.
  if (buffer.length) {
    await handleLine(buffer);
  }
}

// Backwards-compat alias (to be removed in next major)
export const createStdioRenderer = createRenderer;
