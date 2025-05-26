import type { Handler } from "hono";
import { createSSRHandler as createCoreSSRHandler } from "../../core/handlers/ssr";
import { adaptHandler } from "../adapters";
import type { HonoSSRHandlerOptions } from "../types";

/**
 * Creates a Server-Side Rendering route handler for Hono.
 *
 * This handler expects POST requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head?: string, body: string, bodyAttrs?: string }`.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for SSR
 * @returns Hono route handler for SSR requests
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createSSRHandler } from 'universal-renderer/hono';
 * import { renderToString } from 'react-dom/server';
 *
 * const app = new Hono();
 *
 * app.post('/render', createSSRHandler({
 *   setup: async (url, props) => ({ url, props, store: createStore() }),
 *   render: async (context) => ({
 *     body: renderToString(<App {...context} />)
 *   }),
 *   cleanup: (context) => context.store?.dispose()
 * }));
 * ```
 */
export function createSSRHandler<TContext extends Record<string, any>>(
  options: HonoSSRHandlerOptions<TContext>,
): Handler {
  const coreHandler = createCoreSSRHandler(options);
  return adaptHandler(coreHandler);
}
