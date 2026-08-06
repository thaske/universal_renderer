/**
 * A single entry as the gem's `add_query_data` serializes it. The wire shape is
 * snake_case (`query_key`), not camelCase. Getting it wrong is silent: the cache
 * stays empty and the server renders a loading state the client re-fetches.
 */
export type ReactQueryEntry = {
  query_key?: readonly unknown[];
  data?: unknown;
};

/** The one method this needs from a QueryClient, so nothing has to be imported. */
export type QueryCacheTarget = {
  setQueryData(queryKey: readonly unknown[], data: unknown): unknown;
};

export type HydrateReactQueryOptions = {
  /** Prop the entries live under. Matches the gem's `add_query_data`. */
  prop?: string;
};

/**
 * Seeds a React Query cache from the props Rails sent, the counterpart to the
 * gem's `add_query_data`. Call it in `setup` before building the tree, then
 * dehydrate so the browser hydrates the same cache the server rendered from:
 *
 * ```ts
 * setup: async (url, props) => {
 *   queryClient.clear();
 *   hydrateReactQuery(props, queryClient);
 *   const app = <App />;
 *   return { app, payload: { queryCache: dehydrate(queryClient) } };
 * }
 * ```
 *
 * @returns The number of entries seeded, so a caller can assert it got the data
 *   it expected.
 */
export function hydrateReactQuery(
  props: Record<string, unknown> | undefined,
  client: QueryCacheTarget,
  options: HydrateReactQueryOptions = {},
): number {
  const entries = props?.[options.prop ?? "react_query"];
  if (!Array.isArray(entries)) return 0;

  let seeded = 0;

  for (const entry of entries as ReactQueryEntry[]) {
    const queryKey = entry?.query_key;
    if (!Array.isArray(queryKey) || queryKey.length === 0) continue;

    client.setQueryData(queryKey, entry.data);
    seeded += 1;
  }

  return seeded;
}
