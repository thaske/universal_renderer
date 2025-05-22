import type { Callbacks, StreamCallbacks } from "./callbacks";

/**
 * Arbitrary parameters forwarded from the caller (Rails, test harness, etc.)
 * to the server-side rendering pipeline.
 *
 * The object is delivered as the `props` argument to
 * {@link Callbacks.setup} and is therefore available throughout the entire
 * request lifecycle.
 *
 * - Must be JSON-serialisable.
 * - Keys are application-specific; no schema is enforced at this layer.
 */
export interface Props {
  [key: string]: any;
}

/**
 * HTML placeholders recognised by {@link createStreamHandler}. They need to be
 * present in the template string so the server knows where to inject dynamic
 * markup.
 *
 * - `META` – replaced with the result of
 *   {@link StreamCallbacks.meta | streamCallbacks.meta} (if provided).
 * - `BODY` – replaced with the streamed React content.
 */
export enum SSR_MARKERS {
  META = "<!-- SSR_META -->",
  BODY = "<!-- SSR_BODY -->",
}
