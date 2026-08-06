// The render itself: everything the SSR server needs except transport.
//
// Both entries load this module — server.ts from the prebuilt bundle,
// dev.ts through Vite — so it is the only file you edit as the render evolves.
//
// The four hooks exist for different reasons and the split matters:
//
//   setup    async, no side effects on module-level state. Await lazy chunks
//            here, build the tree, seed per-request caches.
//   prepare  sync, runs immediately before the render with no await in between.
//            This is where you mutate shared singletons — a store the tree
//            reads from, a feature-flag object, a library's globals.
//   render   produces the HTML, plus the payload the client hydrates from.
//   cleanup  always runs. Undo prepare, release per-render resources.
//
// Renders are serialized by default (`concurrency: 1` in server.ts), which is
// what makes the prepare/cleanup window safe: no other render can observe your
// mutations. Only raise it once you know the render touches no shared state.
// The waiting queue is bounded and drops disconnected requests, so overload
// cannot leave the renderer working through requests Rails already abandoned.
//
// The corollary is that a render which never settles keeps its slot and ends
// the renderer. `renderTimeout` (server.ts) bounds that: the caller gets a 504
// and /health starts reporting 503 so bin/web restarts the process. Keep the
// hooks below free of unbounded waits — an un-timed fetch is the usual cause.

import { renderToString } from "react-dom/server";

import type { SsrConfig } from "universal-renderer";

import { setBrowserLocation } from "./globals";

// import App from "@/App";

export default {
  setup: async (url, props) => {
    const { pathname, search } = new URL(url);

    // Code that reads window.location during render is common; point the stub
    // at the page actually being rendered. No-op without globals.ts.
    setBrowserLocation(url);

    // Rails' `add_query_data(key, data)` entries arrive under `props.react_query`.
    // Seed them before building the tree, then dehydrate so the browser hydrates
    // the same cache the server rendered from.
    //
    // import { hydrateReactQuery } from "universal-renderer/react-query";
    // hydrateReactQuery(props, queryClient);

    // Await the lazy chunk for this route so it renders synchronously instead of
    // as a Suspense fallback.
    // await preloadRoute(pathname);

    const location = `${pathname}${search}`;

    // const sheet = new ServerStyleSheet();
    // const app = sheet.collectStyles(
    //   <StaticRouter location={location}>
    //     <App />
    //   </StaticRouter>,
    // );

    return { location, props, app: null as any };
  },

  prepare: (context) => {
    // Mutate shared module state for this render only, and record enough to undo
    // it in cleanup.
    //
    // context.previousFlags = { ...FEATURE_FLAGS };
    // Object.assign(FEATURE_FLAGS, context.props.feature_flags);
  },

  render: (context) => {
    const body = renderToString(context.app);

    return {
      body,
      // head: context.sheet.getStyleTags(),
      // bodyAttrs: { "data-page": context.location },

      // Emitted by the `ssr_payload` view helper as an inert JSON script tag —
      // the gem handles the escaping, so do not hand-roll a <script> in `head`.
      // payload: { queryCache: dehydrate(queryClient) },
    };
  },

  cleanup: (context) => {
    // Object.assign(FEATURE_FLAGS, context.previousFlags);
    // context.sheet?.seal();
  },
} satisfies SsrConfig<any>;
