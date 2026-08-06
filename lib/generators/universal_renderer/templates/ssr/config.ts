// The render lifecycle: setup may await; prepare mutates shared state immediately
// before rendering; cleanup restores it. With concurrency: 1, prepare through
// cleanup never overlap.

import { renderToString } from "react-dom/server";

import type { SsrConfig } from "universal-renderer";

import { setBrowserLocation } from "./globals";

export default {
  setup: async (url, props) => {
    const { pathname, search } = new URL(url);
    setBrowserLocation(url);

    // hydrateReactQuery(props, queryClient);
    // await preloadRoute(pathname);

    const location = `${pathname}${search}`;
    // const app = <StaticRouter location={location}><App /></StaticRouter>;

    return { location, props, app: null as any };
  },

  prepare: (context) => {
    // context.previousFlags = { ...FEATURE_FLAGS };
    // Object.assign(FEATURE_FLAGS, context.props.feature_flags);
  },

  render: (context) => ({
    body: renderToString(context.app),
    // head: context.sheet.getStyleTags(),
    // payload: { queryCache: dehydrate(queryClient) },
  }),

  cleanup: (context) => {
    // Object.assign(FEATURE_FLAGS, context.previousFlags);
    // context.sheet?.seal();
  },
} satisfies SsrConfig<any>;
