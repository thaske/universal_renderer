import readline from "readline";
import type { RenderOutput, SSRHandlerOptions } from "../../types";

/**
 * Options for the stdio Node renderer which communicates over stdin/stdout.
 */
export type NodeStdioOptions<
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
 * `UniversalRenderer::Adapter::BunIo` (or an equivalent Node adapter), which maintains a small pool of
 * processes and communicates via stdio.
 */
export async function createRenderer<
  TContext extends Record<string, any> = Record<string, any>,
>(options: NodeStdioOptions<TContext>): Promise<void> {
  const { setup, render, cleanup, error: onError } = options;

  if (!setup) throw new Error("setup callback is required");
  if (!render) throw new Error("render callback is required");

  // Use readline to consume stdin line-by-line.
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  async function handleLine(line = ""): Promise<void> {
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
      process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch (err: any) {
      console.error("[universal-renderer] Render error", err);
      await onError?.(err);
      process.stdout.write(
        `${JSON.stringify({ head: "", body: "", bodyAttrs: "", error: err.message })}\n`,
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

  for await (const line of rl) {
    await handleLine(line as string);
  }
}

// Backwards-compat alias (to be removed in next major)
export const createStdioRenderer = createRenderer;
