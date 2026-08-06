// The render itself. Both entries load this module, so it is the only file you
// edit as the render evolves.
//
//   setup    async, no side effects on module-level state. Await lazy chunks,
//            build the tree, seed per-request caches.
//   prepare  sync, immediately before the render. Mutate shared singletons here.
//   render   produces the HTML, plus the payload the client hydrates from.
//   cleanup  always runs. Undo prepare, release per-render resources.
//
// Renders are serialized (`concurrency: 1` in server.ts), which is what makes the
// prepare/cleanup window safe. The corollary is that a render which never settles
// keeps its slot and ends the renderer, so keep unbounded waits out of the hooks.

import { renderToString } from "react-dom/server";

import type { SsrConfig } from "universal-renderer";

import { setBrowserLocation } from "./globals";

// import App from "@/App";

export default {
  setup: async (url, props) => {
    const { pathname, search } = new URL(url);

    // Point the stub at the page being rendered. No-op without globals.ts.
    setBrowserLocation(url);

    // Seed before building the tree, then dehydrate so the browser hydrates the
    // same cache the server rendered from.
    //
    // import { hydrateReactQuery } from "universal-renderer/react-query";
    // hydrateReactQuery(props, queryClient);

    // Await this route's lazy chunk, or it renders as a Suspense fallback.
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
    // Record enough to undo this in cleanup.
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

      // The `ssr_payload` helper emits this and handles the escaping, so do not
      // hand-roll a <script> in `head`.
      // payload: { queryCache: dehydrate(queryClient) },
    };
  },

  cleanup: (context) => {
    // Object.assign(FEATURE_FLAGS, context.previousFlags);
    // context.sheet?.seal();
  },
} satisfies SsrConfig<any>;
