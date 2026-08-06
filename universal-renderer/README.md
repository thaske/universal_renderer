# universal-renderer (NPM)

The SSR renderer that pairs with the [`universal_renderer`](https://rubygems.org/gems/universal_renderer)
Ruby gem. The gem posts a URL and props; this serves back the HTML.

The two halves share a wire format, so upgrade them together: `0.7.x` here pairs
with gem `0.7.x`.

```bash
npm install universal-renderer     # or bun add / yarn add
```

Full setup — controllers, layout helpers, the Vite build, deployment — is in the
[project README](https://github.com/thaske/universal_renderer#readme). This file
covers the JavaScript API.

## Entry points

| Import                          | Purpose                                              |
| ------------------------------- | ---------------------------------------------------- |
| `universal-renderer`            | `createServer`, `startServer`, handlers, types        |
| `universal-renderer/dev`        | `startDevServer` — Vite-backed development renderer   |
| `universal-renderer/vite`       | `defineSsrConfig` — the SSR build config              |
| `universal-renderer/shim`       | Browser globals for server rendering                  |
| `universal-renderer/shim/auto`  | Same, installed on import                             |
| `universal-renderer/react-query`| `hydrateReactQuery` — seeds a cache from Rails' props |

## The render config

```tsx
import { renderToString } from "react-dom/server";
import type { SsrConfig } from "universal-renderer";

export default {
  // Async, and must not touch module-level state — it awaits, and a mutation
  // made before an await point stays visible for as long as the await lasts.
  setup: async (url, props) => {
    const sheet = new ServerStyleSheet();
    await preloadRoute(new URL(url).pathname);
    return { app: sheet.collectStyles(<App />), sheet, props };
  },

  // Sync, immediately before the render, no await in between. Mutate shared
  // singletons here.
  prepare: (context) => {
    context.previousFlags = { ...FEATURE_FLAGS };
    Object.assign(FEATURE_FLAGS, context.props.feature_flags);
  },

  render: ({ app, sheet }) => ({
    body: renderToString(app),
    head: sheet.getStyleTags(),
    bodyAttrs: { class: "ssr" },
    // Emitted by the gem's `ssr_payload` helper as an inert JSON script tag.
    payload: { state: dehydrate(queryClient) },
  }),

  // Always runs, and runs before the next render starts. Undo prepare here.
  cleanup: ({ sheet, previousFlags }) => {
    Object.assign(FEATURE_FLAGS, previousFlags);
    sheet.seal();
  },
} satisfies SsrConfig<any>;
```

`render` returns `{ head?, body, bodyAttrs?, payload? }`. On the wire that becomes
`{ head, body, body_attrs, payload }`, which is what the gem's `ssr_head`,
`ssr_body`, `ssr_body_attributes`, and `ssr_payload` helpers read.

## Starting the server

```ts
import { startServer } from "universal-renderer";

await startServer(config);
```

`startServer` resolves the port from `SSR_PORT`, then `3001` — the same
convention the gem's generated initializer expects — binds loopback, and resolves
only once the socket is listening. `createServer` is still there if you want the
Express app and nothing else.

### Concurrency

**Renders are serialized by default.** An app retrofitted with SSR keeps
request-scoped state in module-level singletons — a store, a query client, a
mutable flag object, a CSS-in-JS registry — and two renders interleaving through
those is not a slow page, it is one visitor's data in another visitor's HTML.
Scale out with more renderer processes.

```ts
await startServer({ ...config, concurrency: 4 });        // or "unbounded"
```

Only raise it once you have verified the render touches no shared mutable state.
The limiter covers `setup` through `cleanup`, so the `prepare`/`cleanup` window is
guaranteed not to overlap another render.

The waiting queue is capped at ten requests per concurrency slot by default.
Once full, new requests receive `503`; requests that disconnect while waiting
are removed instead of being rendered after their caller has gone away. Set
`queueLimit` explicitly, or use `"unbounded"`, only when the caller's timeout
and your own admission control make a larger backlog safe.

### Paths

```ts
await startServer({ ...config, paths: { render: "/render", stream: "/stream" } });
```

Defaults are `["/", "/static"]`, `/stream`, and `/health`. These must agree with
the gem's `config.render_path` / `config.stream_path` — a mismatch means Rails
posts renders into a 404 and silently falls back to client rendering.

## Development

```ts
// app/frontend/ssr/dev.ts
import "universal-renderer/shim/auto";

const { startDevServer } = await import("universal-renderer/dev");

await startDevServer({ entry: "app/frontend/ssr/config.ts" });
```

The config module is re-resolved on every render, not pinned at boot.
`ssrLoadModule` serves its cache until Vite invalidates it, so this is free per
request, but it means an edit is picked up in full — pinning would keep parts of
the graph at their old version, and a stale module-level singleton renders a page
that silently disagrees with the one the browser hydrates. All four hooks for a
given render come from the same reloaded module, so a render never mixes versions.

Development and production must not share an entry. A Vite dev server transforming
modules per render is the single largest cost in the SSR path.

## Browser globals

```ts
import "universal-renderer/shim/auto";   // first import in the entry
```

`renderToString` never runs effects, but it does evaluate every module in the
graph, and a client-first app reaches for `window`/`document`/`localStorage` at
module scope.

One hazard, because it is silent: some libraries decide once, at
module-evaluation time, whether they are in a browser —
`typeof window !== "undefined" ? null : {...}`. Imported *after* the shim, such a
library loses its server API for good. Import those statically first, then install
the shim explicitly:

```ts
import "aphrodite";                       // must see a window-less environment
import { installBrowserGlobals } from "universal-renderer/shim";

installBrowserGlobals({ viewport: { width: 1280, height: 800 } });

const { default: config } = await import("./config");
```

Pick a viewport and have the client's first render start from the same numbers,
or every width-dependent branch disagrees and React discards the server markup.

`setBrowserLocation(url)` points the shimmed `location` at the page being
rendered; call it at the top of `setup`.

## React Query

```ts
import { hydrateReactQuery } from "universal-renderer/react-query";

hydrateReactQuery(props, queryClient);
```

The counterpart to the gem's `add_query_data(query_key, data)`. Entries arrive
under `props.react_query` as `{ query_key, data }` — snake_case, because the gem
deep-stringifies keys. It returns the number of entries seeded, so you can assert
you got the data you expected rather than rendering an empty page.

## The SSR build

```ts
// vite.config.ssr.mts
import react from "@vitejs/plugin-react";
import { defineSsrConfig } from "universal-renderer/vite";

export default defineSsrConfig({
  entry: "app/frontend/ssr/server.ts",
  plugins: [react()],
});
```

Handles the four settings that are each wrong by default for a Rails SSR build and
each fail silently. Note what is absent: `vite-plugin-rails`. See the function's
JSDoc for the rest.

## Streaming

```ts
await startServer({
  ...config,
  streamCallbacks: {
    node: (context) => context.app,
    head: (context) => context.helmetTags,
  },
});
```

Mounts `POST /stream`, which expects `{ url, props, template }` where `template`
is the Rails layout carrying `<!-- SSR_HEAD -->` and `<!-- SSR_BODY -->` markers.
A streaming render holds its concurrency slot until the response finishes or the
client disconnects — the tree is still reading module state for as long as it is
producing chunks.

## Handlers

For a server you assemble yourself:

```ts
import express from "express";
import { createHealthHandler, createSSRHandler, createLimiter } from "universal-renderer";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.get("/health", createHealthHandler());
app.post("/render", createSSRHandler({ ...config, limiter: createLimiter(1) }));
```

Pass the same `limiter` to every handler that renders, or they will not contend
with each other.

## License

MIT
