import type { Response } from "express";
import type { Transform } from "node:stream";

import createHandler from "../handler";
import createStreamHandler from "../streamHandler";

/**
 * Lifecycle hooks executed for every incoming render request – regardless of
 * whether the response is JSON (see {@link createHandler}) or an HTML stream
 * (see {@link createStreamHandler}).
 *
 * The generic parameters keep the API flexible:
 *  - `TContext` – the request–scoped object returned by {@link Callbacks.setup} and
 *    subsequently passed to every other callback.
 *  - `TRenderOutput` – the JSON-serialisable value returned by
 *    {@link Callbacks.render} when using the non-streaming handler.
 */

// Core callbacks common to all rendering strategies.
export interface Callbacks<
  TContext extends Record<string, any> = Record<string, any>,
  TRenderOutput extends Record<string, any> = Record<string, any>,
> {
  /**
   * Initialises the application for the given request.
   *
   * Typical responsibilities include data-fetching, auth checks or store
   * creation. The returned context object is cached for the remainder of the
   * lifecycle and will be provided to every other callback.
   *
   * If this function resolves to `undefined` the handler will respond with a
   * 500 – therefore **always** return some form of context, even when empty.
   */
  setup: (
    requestUrl: string,
    props: Record<string, any>,
  ) => Promise<TContext> | TContext;

  /**
   * Generates the final render result for non-streaming requests (e.g. JSON
   * APIs or RPC endpoints).
   *
   * When using {@link createStreamHandler} this callback is ignored – the
   * streaming pipeline is driven by {@link StreamCallbacks.app}
   * instead.
   */
  render: (context: TContext) => Promise<TRenderOutput> | TRenderOutput;

  /**
   * Per-request clean-up hook. Invoked exactly once, even if an earlier step
   * throws.
   *
   * Use this to close DB connections, abort fetches, clear timers, etc.
   */
  cleanup: (context: TContext) => void;
}

/**
 * Streaming-specific callbacks, executed between setup and cleanup.
 */
export interface StreamCallbacks<
  TContext extends Record<string, any> = Record<string, any>,
> {
  /**
   * Produces the React element tree that will be streamed to the client.
   *
   * This is executed after {@link Callbacks.setup}; the resulting vDOM is
   * passed to `react-dom/server`'s `renderToPipeableStream`.
   */
  app: (context: TContext) => React.ReactNode;

  /**
   * Optional hook to inject additional `<meta>` tags into the HTML template.
   *
   * The returned string replaces the `<!--SSR_META-->` marker (see
   * {@link SSR_MARKERS.META}).
   */
  meta?: (context: TContext) => Promise<string> | string;

  /**
   * Allows attaching a custom `stream.Transform` between React's output and
   * the HTTP response. Useful for compression, i18n processing, etc.
   */
  transform?: (context: TContext) => Transform | undefined;

  /**
   * Invoked once the React stream has ended but *before* the trailing part of
   * the HTML template is flushed. This is a good place to write closing tags
   * or perform analytics logging.
   */
  close?: (res: Response, context: TContext) => Promise<void> | void;
}
