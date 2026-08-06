# UniversalRenderer

[![CI](https://img.shields.io/github/actions/workflow/status/thaske/universal_renderer/ci.yml)](https://github.com/thaske/universal_renderer/actions/workflows/ci.yml)

[![Gem Version](https://img.shields.io/gem/v/universal_renderer)](https://rubygems.org/gems/universal_renderer) [![NPM Version](https://img.shields.io/npm/v/universal-renderer)](https://www.npmjs.com/package/universal-renderer)

Server-Side Rendering for Rails apps with a React front end.

## Overview

UniversalRenderer runs your React app in a small Node/Bun service and splices the
result into your Rails layout. It is two halves of one contract: the
`universal_renderer` gem talks to the `universal-renderer` NPM package.

The design assumption is retrofitting: you have a working client-rendered app,
you want the first paint to be server-rendered, and you cannot afford for SSR to
become a source of outages. So every failure path — service down, timeout, 500,
not configured — falls back to client-side rendering silently, and the
instrumentation exists so "silently" does not mean "invisibly".

### Version compatibility

The two packages share a wire format, so upgrade them together.

| Gem     | NPM package | Notes                                                        |
| ------- | ----------- | ------------------------------------------------------------ |
| `0.7.x` | `0.7.x`     | `payload`, conditional `enable_ssr`, `concurrency`, `prepare` |
| `0.5.x` | `0.6.x`     |                                                              |

## Installation

```ruby
# Gemfile
gem "universal_renderer"
```

```bash
bundle install
bun add universal-renderer          # or npm / yarn
bin/rails generate universal_renderer:install
```

The generator writes the initializer, the two renderer entry points, the SSR Vite
build, the `assets:precompile` hook, and `bin/web`. Pass
`--frontend-dir=app/client` if your JavaScript is not in `app/frontend`.

## Rendering from a controller

There are two ways in, and they are equally supported.

**Declarative**, when the whole action is server-rendered:

```ruby
class ArticlesController < ApplicationController
  enable_ssr only: :show, unless: -> { current_user.present? }

  def show
    @article = Article.find(params[:id])
    add_query_data(["articles", @article.slug], article_json)
    render "common/js_only"
  end
end
```

`enable_ssr` takes `only:`, `except:`, `if:`, and `unless:` (Symbol or Proc,
evaluated against the controller), plus `streaming: true`.

**Imperative**, when the decision or the data depends on request state:

```ruby
def show
  @article = Article.find(params[:id])
  return render("common/js_only") unless public_view?

  add_query_data(["articles", @article.slug], article_json)
  add_prop(:feature_flags, enabled_flags)
  render_ssr

  render "common/js_only"
end
```

`render_ssr` fetches once, memoizes, and returns the payload — or `nil`, which is
your signal to let the client-rendered path stand. It works whether or not the
controller called `enable_ssr`.

### Props

| Method                          | Effect                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| `add_prop(key, value)`          | Sets one prop. Also takes a hash.                               |
| `push_prop(key, value)`         | Appends to an array prop.                                       |
| `add_query_data(key, data)`     | Adds a React Query cache entry under the `react_query` prop.     |
| `ssr_props`                     | The accumulated hash, if you need to inspect or merge it.        |

## Rendering in the layout

```erb
<head>
  <%= ssr_head %>
  <%= ssr_payload %>
</head>
<body class="app" <%= ssr_body_attributes %>>
  <div id="root"><%= ssr_body %></div>

  <%# Server-rendered pages hydrate; everything else boots a client render. %>
  <%= vite_typescript_tag ssr? ? "hydrate.tsx" : "application.tsx" %>
</body>
```

Every helper is a no-op when there is nothing to emit, so the layout needs no
conditionals. `ssr?` is there for the decisions that are not about emitting HTML —
picking an entry point, skipping a preload — and it never requires reading an
instance variable.

`ssr_payload` emits whatever your `render` callback returned as `payload`, as an
inert `<script type="application/json">`, escaped. That is the channel for
hydration state, because the interesting state is only known after the render: a
dehydrated query cache, the class names a CSS-in-JS library already wrote into
`head`. Do not hand-roll a script tag inside `head`.

## Configuration

```ruby
UniversalRenderer.configure do |c|
  c.url = ENV.fetch("UNIVERSAL_RENDERER_URL", "http://localhost:3001")
  c.timeout = 3
  c.stream_path = "/stream"       # must match the Node side's `paths`
  c.http.pool_size = 5
end
```

The gem never reads ENV itself; bind whatever keys you like in the initializer.
The suggested prefix is `UNIVERSAL_RENDERER_*`.

| Option         | Default          | Notes                                                            |
| -------------- | ---------------- | ---------------------------------------------------------------- |
| `url`          | `nil`            | Blank disables SSR entirely.                                     |
| `timeout`      | `3`              | Open and read timeout, seconds.                                  |
| `render_path`  | `nil`            | `nil` uses the path already in `url`.                            |
| `stream_path`  | `"/stream"`      | Must match the Node side.                                        |
| `sanitize`     | `true`           | See below.                                                       |
| `scrubber`     | `Scrubber.new`   | Any `Loofah::Scrubber`.                                          |
| `auto_include` | `true`           | `false` to include `Renderable` per controller instead.          |
| `on_error`     | `nil`            | `->(error, context) { ... }`                                     |

### Sanitization

`ssr_head` and `ssr_body` run the render through Loofah by default.

Be clear about what that buys you. The bundled scrubber is a **blocklist**, and
a blocklist over the whole HTML grammar cannot be a boundary against
attacker-controlled markup: the sanitizer and the browser have to agree on how
the document parses, and elements that switch parsing context are how they stop
agreeing. The scrubber removes the ones that are known to do this (`noscript`,
the MathML integration points) and pins them with tests, but treat it as defense
in depth over HTML your own renderer produced — **escape untrusted data inside
the render**, which React already does unless you reach for
`dangerouslySetInnerHTML`.

It also parses and rewrites the whole document on the Rails side of every
request, which eats into the latency SSR is meant to buy. `c.sanitize = false`
is a reasonable trade once you are confident about what the renderer emits. It
defaults to on because the cost is bounded and the mistake it catches is not.

### Observability

Every failed render is a silent fallback, so without a signal you cannot tell a
healthy renderer from one that has been down for a week:

```ruby
ActiveSupport::Notifications.subscribe("render.universal_renderer") do |event|
  StatsD.timing("ssr.duration", event.duration,
                tags: ["outcome:#{event.payload[:outcome]}"])
end

c.on_error = ->(error, context) { Sentry.capture_exception(error, extra: context) }
```

`outcome` is one of `:ok`, `:not_configured`, `:http_error`, `:timeout`, `:error`.
The notification fires even when no renderer URL is configured; `on_error` is
reserved for failures after a configured render is attempted.

## The renderer

### The render config

One module holds the whole render (`app/frontend/ssr/config.ts` by convention).
Both entry points load it.

```tsx
import { dehydrate } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { ServerStyleSheet } from "styled-components";
import type { SsrConfig } from "universal-renderer";
import { hydrateReactQuery } from "universal-renderer/react-query";

import { setBrowserLocation } from "./globals";
import App from "@/App";
import { preloadRoute, queryClient } from "@/App";

export default {
  setup: async (url, props) => {
    const { pathname, search } = new URL(url);
    setBrowserLocation(url);

    queryClient.clear();
    hydrateReactQuery(props, queryClient);
    await preloadRoute(pathname);

    const sheet = new ServerStyleSheet();
    const app = sheet.collectStyles(
      <StaticRouter location={`${pathname}${search}`}>
        <App />
      </StaticRouter>,
    );

    return { app, sheet, props, state: dehydrate(queryClient) };
  },

  prepare: (context) => {
    context.previousFlags = { ...FEATURE_FLAGS };
    Object.assign(FEATURE_FLAGS, context.props.feature_flags);
  },

  render: ({ app, sheet, state }) => ({
    body: renderToString(app),
    head: sheet.getStyleTags(),
    payload: { state },
  }),

  cleanup: ({ sheet, previousFlags }) => {
    Object.assign(FEATURE_FLAGS, previousFlags);
    sheet.seal();
    queryClient.clear();
  },
} satisfies SsrConfig<any>;
```

The four hooks are not arbitrary:

- **`setup`** is async and must not touch module-level state. It awaits things —
  a lazy route chunk, a fetch — and a mutation made before an await point stays
  visible for as long as the await lasts.
- **`prepare`** is sync and runs immediately before the render, with no await in
  between. This is where shared singletons get mutated.
- **`render`** produces the HTML and the hydration payload.
- **`cleanup`** always runs, and runs before the next render starts. Undo
  `prepare` here.

### Concurrency

Renders are **serialized by default**. An app retrofitted with SSR keeps
request-scoped state in module-level singletons — a store, a query client, a
mutable feature-flag object, a CSS-in-JS registry — and two renders interleaving
through those is not a slow page, it is one visitor's data in another visitor's
HTML. Scale out with more renderer processes; `bin/web` starts one per web
process, so SSR capacity tracks your web dyno count.

Raise `concurrency` (or pass `"unbounded"`) only once you have verified the render
touches no shared mutable state.

The renderer admits at most ten waiting requests per concurrency slot by
default. It returns `503` when that queue is full and removes requests that
disconnect while waiting, so a Rails timeout cannot leave stale renders ahead
of live traffic. Configure `queueLimit` only if the default does not fit your
traffic and render latency.

### Render timeout and health

Serializing renders has a cost worth naming: a slot is never taken back from a
running render — it is still touching module state, and handing that slot on is
the interleaving `concurrency` exists to prevent — so **one render that never
settles ends the renderer**. At `concurrency: 1` the queue fills, everything
after it gets `503`, and Rails falls back to client rendering indefinitely.

`renderTimeout` (default `10000`ms, `false` to disable) bounds it from both
ends:

- the caller gets a `504` instead of hanging, and
- `GET /health` starts returning `503` with `{ status: "STALLED", renders: {...} }`
  once a render has held its slot past the timeout.

Nothing inside the process can clear a stuck render, so the health signal is the
point: the generated `bin/web` polls it and restarts the renderer without
touching the app server. Tune with `SSR_HEALTH_INTERVAL`, `SSR_HEALTH_FAILURES`,
or turn it off with `SSR_WATCHDOG=0`.

Development sets `renderTimeout: false` by default — a breakpoint in the render
outlasts any production budget, and a `504` there is noise.

### Entry points

Production runs the prebuilt bundle:

```ts
// app/frontend/ssr/server.ts
import "./globals";

const { default: config } = await import("./config");
const { startServer } = await import("universal-renderer");

await startServer(config);
```

Development loads the config through Vite, so the app graph gets the same
transforms the client dev server gives it and edits need no rebuild:

```ts
// app/frontend/ssr/dev.ts
import "./globals";

const { startDevServer } = await import("universal-renderer/dev");

await startDevServer({ entry: "app/frontend/ssr/config.ts" });
```

These must not be the same file. A Vite dev server transforming modules per render
is the single largest cost in the SSR path.

Note the **dynamic** imports. The app graph touches browser globals while its
modules evaluate, and static imports are all evaluated before the entry body runs,
so `./globals` would land too late.

### Browser globals

`renderToString` does not run effects, so `useEffect` is safe. It does still
evaluate every module in the graph and every render body, and a client-first app
reaches for `window`, `document`, `localStorage`, or `navigator` in both — a
singleton assigning `window.myThing` at module scope, a component reading
`window.innerWidth` while rendering. None of that survives under Node, and none
of it is React's problem to solve.

The package does not ship a shim for this, deliberately. Which globals a graph
touches is a property of that graph, not of SSR, so a library version would be
guesses: too small to boot your app and too large to reason about. The generator
scaffolds `app/frontend/ssr/globals.ts` in your app instead, as a starting point
you own, edit, and delete if it turns out you need none of it. It carries the
reasoning, including the two things that bite:

- Defining `window` makes `typeof window === "undefined"` false process-wide.
  That check is how libraries detect a server, so they all take the browser
  path. Prefer fixing the module that reaches for the DOM.
- Some libraries decide once, at module-evaluation time, whether they are in a
  browser (`typeof window !== "undefined" ? null : {...}`). Imported after your
  globals, such a library loses its server API for good.

### The SSR build

```ts
// vite.config.ssr.mts
import react from "@vitejs/plugin-react";
import { defineSsrConfig } from "universal-renderer/vite";

export default defineSsrConfig({
  entry: "app/frontend/ssr/server.ts",
  plugins: [react()],
});
```

`defineSsrConfig` exists because a Rails SSR build has four settings that are each
wrong by default and each fail *silently* — you get a bundle, it just renders the
wrong thing. Note in particular what is **absent**: `vite-plugin-rails`, which is
built for the client manifest pipeline and overrides entrypoints and outDir. List
only the plugins the render itself needs; your client build keeps using
`vite.config.mts` unchanged. See the function's docs for the other three.

The bundle lands at `ssr-build/server.mjs`, deliberately outside `public/` — it is
server code and must not be web-servable.

### Running it

```procfile
# Procfile.dev
web: bin/rails s
vite: bin/vite dev
ssr: bun app/frontend/ssr/dev.ts
```

```procfile
# Procfile
web: bin/web
```

`bin/web` runs the renderer alongside your app server on the same host rather than
as a separate process type, because PaaS process types get no routable address for
each other. If the renderer dies, requests fall back to client rendering; that is
a degraded page, not an outage, so it must not take the process down.

### Sorbet

The engine includes `Renderable` into `ActionController::Base` through
`ActiveSupport.on_load`, which happens at runtime and so is invisible to Sorbet.
Add a shim, or every `render_ssr` / `add_prop` call is an undefined-method error:

```ruby
# sorbet/rbi/shims/universal_renderer.rbi
# typed: true

class ActionController::Base
  include UniversalRenderer::Renderable
end
```

## Streaming

Streaming is opt-in per controller:

```ruby
enable_ssr streaming: true
```

The layout emits `<!-- SSR_HEAD -->` / `<!-- SSR_BODY -->` markers (`ssr_head`
and `ssr_body` do this for you), Rails posts the rendered layout to the SSR
service as `template`, and the service streams the substituted document back.
Provide `streamCallbacks` in the render config to enable the endpoint. A failed
stream falls back to a normal blocking render.

## Development

```bash
bundle install && bun install

bundle exec rspec          # gem
bundle exec rubocop
cd universal-renderer && bun run test && bunx tsc --noEmit
```

## License

MIT
