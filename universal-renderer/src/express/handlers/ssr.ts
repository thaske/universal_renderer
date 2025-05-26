import type { RequestHandler } from "express";
import { createSSRHandler as createCoreSSRHandler } from "../../core/handlers/ssr";
import { adaptHandler } from "../adapters";
import type { ExpressSSRHandlerOptions } from "../types";

/**
 * Creates a Server-Side Rendering route handler for Express.
 *
 * This handler expects POST requests with `{ url: string, props?: any }` and
 * returns JSON responses with `{ head?: string, body: string, bodyAttrs?: string }`.
 *
 * @template TContext - The type of context object used throughout the rendering pipeline
 * @param options - Configuration options for SSR
 * @returns Express route handler for SSR requests
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createSSRHandler } from 'universal-renderer/express';
 * import { renderToString } from 'react-dom/server';
 *
 * const app = express();
 * app.use(express.json());
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
  options: ExpressSSRHandlerOptions<TContext>,
): RequestHandler {
  const coreHandler = createCoreSSRHandler(options);
  return adaptHandler(coreHandler);
}
