# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.7.0 (Ruby Gem) / 0.7.0 (NPM Package)

Shaped by a real integration into a large client-first Rails app. Almost
everything here removes work that consumer had to do by hand, or removes a way to
get it silently wrong.

### Ruby Gem

#### Added

- Conditional `enable_ssr`: `only:`, `except:`, `if:`, and `unless:` (Symbol or
  Proc, evaluated against the controller). Previously SSR was all-or-nothing per
  controller class, so any app that server-renders only public pages had to bypass
  the concern and call the client directly.
- Public `render_ssr(props = nil)` for driving a render from the action, where the
  data and the decision usually live. Idempotent, returns the payload or `nil`.
  `fetch_ssr` remains as an alias.
- Public `ssr?` and `ssr_response`, exposed to views via `helper_method`. Nothing
  needs to read `@ssr` any more — including the common case of choosing between a
  hydration entry point and a client-render entry point.
- `ssr_props`, `add_prop`, `push_prop`, and `add_query_data` are public, so
  concerns and service objects can contribute props.
- `payload` on the render response, with an `ssr_payload` helper that emits it as
  an escaped, inert JSON script tag. Hydration state — a dehydrated query cache,
  the class names a CSS-in-JS library already wrote into `head` — is only known
  after the render, so it travels back from the renderer rather than out from
  Rails.
- `ssr_body_attributes` helper. `body_attrs` had been plumbed end to end since
  0.5.0 with no way to actually use it.
- `config.sanitize` and `config.scrubber`. Sanitizing a full page render parses
  and rewrites the whole document on every request, which eats into the latency
  SSR is meant to buy; the renderer is first-party code, so opting out is a
  reasonable trade.
- `render.universal_renderer` ActiveSupport notification and a `config.on_error`
  callback. Every failure mode here is a silent fallback to client rendering,
  which is right for availability and useless for operations — without a signal
  you cannot tell a healthy renderer from one that has been down for a week.
  Streaming failures report too, including partial transfers that cannot safely
  fall back after bytes have already been written.
- `config.auto_include`, to stop including the concern into every
  `ActionController::Base` descendant.
- `config.render_path`, matching the existing `stream_path`.
- The install generator now scaffolds the whole working setup: both renderer entry
  points, `vite.config.ssr.mts`, the `assets:precompile` hook, and `bin/web`.
  Takes `--frontend-dir`, `--skip-frontend`, `--skip-deploy`.
  - The generated `ssr:build` task goes through the package script
    (`bun run build:ssr`) rather than invoking `vite` directly:
    `node_modules/.bin` is not on `PATH` during a deploy build, so a bare `vite`
    failed there while working fine in a shell. It also no longer depends on
    `:environment`; bundling the frontend does not need Rails booted.
  - The generated `bin/web` waits for the app server to drain on `SIGTERM`
    instead of killing it and exiting immediately, and supervises the renderer:
    it polls `/health` and restarts the renderer, without touching the app
    server, when the renderer stops reporting healthy. `SSR_WATCHDOG=0`,
    `SSR_HEALTH_INTERVAL`, and `SSR_HEALTH_FAILURES` tune it.

#### Changed

- `add_query_data` stringifies Symbol parts of a query key. Numeric parts are left
  alone, since React Query compares keys structurally and `["users", 1]` has to
  stay numeric. Previously the key kept Symbols on the Ruby side and matched only
  once JSON flattened them.
- Dropped the app-wide `before_action :initialize_props`; props initialize lazily.
- The engine registers its controller hook after `load_config_initializers`, so
  `config.auto_include` is read reliably.
- Dropped the `body_html` fallback in the response parser — no shipped version of
  the NPM package emits it.

#### Removed

- The `ssr_props` and `ssr_props_json` **view helpers** (the controller-side
  `ssr_props` hash is unaffected and now public). They emitted the props Rails
  had just sent, which the client already has; what it actually needs is the
  state the render produced. Use `payload` and `ssr_payload`.

  Removed outright rather than deprecated: the gem is pre-1.0 with no known
  users of these two, and carrying a deprecation cycle for nobody costs more
  than it saves.

#### Fixed

- `Client::Stream` called `log_setup_error` bare, but `ErrorLogger` defines only
  singleton methods, so that rescue path raised `NoMethodError` instead of logging.
- `render_ssr(props)` merged its `props` argument even when a render had
  already happened for the request, silently changing `ssr_props` without
  affecting the response. Props are now ignored once the render has run.
- The response parser no longer deep-symbolizes the body. Only the four
  top-level keys are read, and `payload` can be a large dehydrated query cache
  that was being walked and re-allocated on every render. Payload keys now
  reach views as strings, matching what `JSON.parse` gives the client.
- A relative `render_path` / `stream_path` (`"render"` rather than
  `"/render"`) is treated as absolute. `URI.join` replaces the base URL's last
  path segment with a relative path, so a path-prefix mount would have posted
  renders to the wrong endpoint and silently fallen back.
- A renderer answering `200` with the wrong shape no longer raises inside the
  layout. `body_attrs` that is not a Hash reached `tag.attributes`, which calls
  `to_h` on it — a `NoMethodError` on a live page, and the one failure mode in
  this gem that did not degrade to client-side rendering. The response parser
  now type-checks `head`, `body`, and `body_attrs`, a non-object response is
  reported as `:error` and falls back, and `ssr_body_attributes` drops anything
  that is not a Hash.
- A failed stream no longer emits `<!-- SSR_HEAD -->` / `<!-- SSR_BODY -->` into
  the fallback page. `ssr_streaming?` is now request-scoped and downgrades when
  the stream fails, so the fallback render behaves like a non-streaming one.
- `render json:`, `render plain:`, and the other non-page render options no
  longer trigger a blocking SSR round trip whose result is discarded. The
  request format is still HTML for a `render json:` inside a form post, so the
  format check alone did not cover it.
- `SSR::Scrubber` requires the ActiveSupport core extension it uses, so it can
  be required outside a booted Rails app.

#### Security

- **Fixed two working XSS bypasses in the scrubber**, both verified end to end
  against a real browser. They predate this release; the mechanism is a parse
  mismatch between Loofah and the browser, on elements that switch parsing
  context:
  - `<noscript>` is parsed as markup with scripting disabled (what the sanitizer
    always sees) and as raw text with scripting enabled (what the browser always
    sees), so `<noscript><p title="</noscript><img src=x onerror=...>">` reached
    the browser as a live element.
  - `<mglyph>`, `<malignmark>`, and `<annotation-xml>` flip the parser between
    MathML foreign content and HTML integration points, giving the same
    mismatch inside `<math>`.

  All four elements are now removed outright. None has any business in a server
  render, and both payloads are pinned by tests.
- Documented what the scrubber is, since the previous framing overclaimed: it is
  a blocklist, so it is defense in depth over HTML your own renderer produced,
  not a boundary against attacker-controlled markup. Escape untrusted data
  inside the render.
- Hardened SSR HTML sanitization against embedded documents, event handlers,
  executable URL protocols, SVG data payloads, and meta refresh redirects.
- Relaxed it in two narrow places, because the previous rules made SSR
  self-defeating. Both fail closed in the ambiguous cases:
  - `<script>` survives when it declares `application/json` or
    `application/ld+json`. HTML treats those as data blocks and never executes
    them, and without the exception server-rendered JSON-LD could not survive
    sanitization at all — stripping the SEO that motivates server rendering.
    Scripts with no `type`, or with `module`, `importmap`, `speculationrules`, or
    any JavaScript MIME type, stay blocked.
  - SVG data URIs survive in `<img src>` and `<img srcset>`, and nowhere else.
    Browsers render SVG referenced by `<img>` in a restricted mode that runs no
    scripts and loads no external references, and bundlers routinely inline icons
    this way, so otherwise every inlined logo vanished from the server render.
    They remain blocked on `<a href>`, `<object data>`, and every other element
    and attribute, where the SVG *would* execute as a document. `<source>`
    inside `<picture>` gets the same allowance, since it feeds the same
    restricted image mode; `<source>` inside `<video>`/`<audio>` does not.

#### Known limitations

- `srcset` is checked as if it were a single URI. It is a comma-separated
  candidate list and every check anchors at the start of the value, so an
  approved first candidate carries whatever follows it. Not exploitable —
  candidates are fetched as images, and neither `javascript:` nor
  `data:text/html` is a fetchable image source — but the guarantee is weaker
  than it reads for that one attribute, and it is pinned by a test. A real fix
  has to parse candidates rather than split on commas, since data URIs
  legitimately contain them.

### NPM Package

#### Added

- `concurrency` option, **defaulting to `1`**. An app retrofitted with SSR keeps
  request state in module-level singletons, and two renders interleaving through
  those is one visitor's data in another visitor's HTML — a security bug, not a
  perf bug. Previously every consumer had to hand-roll this. `"unbounded"` opts
  out. The limiter spans `setup` through `cleanup` and is shared with the
  streaming handler.
- `renderTimeout`, defaulting to `10000`ms — the other half of the `concurrency`
  decision. A running render's slot is never revoked (it is still touching module
  state), so a render that never settles holds its slot forever and, at
  `concurrency: 1`, ends the renderer: the queue fills and everything after it
  gets `503` until a restart. The timeout answers the caller `504`, and
  `GET /health` then reports `503` with `{ status: "STALLED", renders: {...} }`,
  which is what the generated `bin/web` watches. `false` disables it, and
  `startDevServer` defaults it off.
- `Limiter.stats()`, reporting active and waiting renders plus how long the
  oldest has held its slot, and `withTimeout` / `RenderTimeoutError` for callers
  composing their own handlers.
- `createHealthHandler` takes a `limiter` and `stallAfterMs`, so the health
  endpoint distinguishes a busy renderer from a wedged one.
- `queueLimit`, defaulting to ten waiting requests per concurrency slot. The
  renderer returns `503` when full and removes requests that disconnect while
  waiting, so overload cannot leave stale renders ahead of live traffic.
  `"unbounded"` opts out for callers with external admission control.
- `prepare` hook, run synchronously immediately before the render with no await in
  between. `setup` is async, so mutations made there stay visible for as long as
  the await lasts; `prepare`/`cleanup` is the window that is actually safe.
- `payload` on `RenderOutput`, serialized as `payload` for the gem's `ssr_payload`.
- `startServer`, which resolves the port from `SSR_PORT` then `3001`, binds
  loopback, and resolves once listening.
- `paths` option for the render, stream, and health endpoints. `stream_path` was
  configurable on the Ruby side while the Node side hardcoded `/stream`, so
  changing it silently 404'd.
- `universal-renderer/dev` — `startDevServer`, the Vite-backed development
  renderer. Re-resolves the render config per render so an edit is picked up in
  full, with all four hooks coming from the same reloaded module.
- `universal-renderer/vite` — `defineSsrConfig`, encoding the four settings a
  Rails SSR build gets wrong by default and silently: excluding
  `vite-plugin-rails`, matching the client build's asset prefix, disabling
  `publicDir`, and putting the bundle outside `public/`. Output filename is pinned
  rather than left to depend on `"type": "module"`.
- `universal-renderer/react-query` — `hydrateReactQuery`, matching the gem's
  `add_query_data` wire shape.
- `SsrConfig` type for the render config module.
- `bodyLimit` option.

#### Removed

- `universal-renderer/shim` and `/shim/auto`. Server rendering does need browser
  globals — `renderToString` evaluates every module in the graph and every render
  body, and a client-first app reaches for `window` in both — but *which* globals
  is a property of the graph, not of SSR. A library version is guesses: too small
  to boot the app, too large to reason about, and defining `window` at all flips
  `typeof window === "undefined"` process-wide, which is how every library
  detects a server.

  The gem's install generator now scaffolds `app/frontend/ssr/globals.ts` into
  the app instead, with the reasoning and the two hazards in comments. It is
  app code: edit it, or delete it if your graph does not need it.

#### Changed

- Restored React 18 compatibility and made Vite a development-only dependency.
- `error` moved off the per-handler option types onto `ExpressServerOptions`,
  where it is the only place it ever took effect. `createServer` was passing it
  into `createStreamHandler`, which never read it.
- `startDevServer`'s `overrides` is typed to the options it can actually
  override. The lifecycle hooks and `streamCallbacks` are re-resolved from the
  entry per render, so overriding them was silently ignored.

#### Fixed

- A streaming client disconnect during `setup` no longer skips the context cleanup
  that `setup` was about to produce.
- `startDevServer` resolves Vite from the host application. A bare import lands on
  this package's own copy whenever it is linked, and two Vite instances disagree
  about plugin state — the symptom is not an import error but path aliases failing
  to resolve mid-render.
- The README's React Query example read `props.query_data` with `{ key, data }`.
  The gem has always emitted `props.react_query` with `{ query_key, data }`.
- Corrected the CommonJS entry points and included the MIT license.
- Hardened HTTP request validation, asynchronous cleanup, streaming errors, and
  client-disconnect handling.
- Applied custom Express middleware before built-in SSR and health routes.
- Prevented integration tests from leaking Bun servers and temporary installs.
- The streaming handler validates `setup` at boot, like the blocking handler,
  instead of failing with a `TypeError` at request time.
- `startDevServer` delegates the stream `transform` to the per-render config
  like the other streaming callbacks, instead of pinning the boot-time one.
- `startServer` drops its startup error listener once listening, so a later
  server `error` event surfaces instead of being swallowed by an
  already-settled promise.
- `resolvePort` validates its result instead of passing a fractional or
  out-of-range value to `listen`, which failed at boot with an opaque error long
  after the typo that caused it.
- `startDevServer`'s `overrides.error` takes precedence over the loaded
  config's, matching every other option.
- `defineSsrConfig` rejects an array of rollup outputs instead of spreading it
  into an object and silently losing the pinned entry filename.

### Tooling

- RuboCop failures block CI, and the package has entry-point smoke tests.

## 0.5.2 (Ruby Gem) - 2026-07-09

### Fixed

- Limit the Rails controller hook to `ActionController::Base`, preventing the
  renderable concern from being included in API-only controllers that do not
  provide the required view helpers.

## 0.5.1 (Ruby Gem) - 2026-07-09

### Fixed

- Load the SSR helpers and renderable concern before registering the Rails engine hook, preventing Rails boot failures when the gem is required by Bundler.

## 0.5.0 (Ruby Gem) / 0.6.0 (NPM Package) - 2026-07-09

### Ruby Gem

#### Added

- Configurable, tagged logging through `UniversalRenderer.logger=`.
- Persistent HTTP connection pooling with configurable `config.http.pool_size`.
- `add_query_data`, `ssr_props`, and `ssr_props_json` helpers for hydration data.

#### Changed (breaking)

- Configuration no longer reads environment variables automatically. Configure
  `url`, `timeout`, and `stream_path` explicitly in the host application.
- Renamed `config.ssr_url` to `config.url` and `config.ssr_stream_path` to
  `config.stream_path`.
- The runtime is HTTP-only; the unreleased stdio and multi-adapter abstractions
  were removed before this release.

#### Fixed

- Hardened streaming fallback and finalization handling, including safe
  treatment of partial responses and persistent connection reuse.

### NPM Package

#### Added

- CommonJS and ESM builds with generated TypeScript declarations.
- The `universal-renderer/http` subpath export and HTTP handler factories.
- Health checks, 404 responses, and configurable Express error handling.

#### Changed (breaking)

- `RenderOutput.bodyAttrs` is now a string-to-string map and is serialized as
  `body_attrs` in the HTTP response.
- HTTP-specific types are now namespaced under the HTTP entry point.
- Updated React, Express, Vite, TypeScript, and build-tool peer/development
  dependencies.

#### Fixed

- Stream transforms now finish before the trailing HTML template is written.
- HTTP rendering and streaming errors now flow through Express error handling.

### Documentation

- Updated the Rails and SSR server setup examples for the HTTP-only runtime,
  explicit configuration, streaming, and hydration data.

## 0.4.4 - 2025-06-29

### Ruby Gem

#### Fixed

- Resolved conflicts with Devise by removing `ActionController::Live` from the base `Renderable` module
  - Fixed "uncaught throw :warden" errors in authentication flows

#### Changed

- `ActionController::Live` is now only included for controllers that explicitly enable streaming SSR via `enable_ssr(streaming: true)`

## 0.4.2 - 2025-05-23

### Ruby Gem

#### Added

- Comprehensive testing infrastructure with RSpec configuration and test helpers
- Integration test framework for validating HTTP contracts between Ruby gem and NPM package
- Test fixtures for SSR responses and HTML templates (`spec/fixtures/`)
- Performance testing capabilities with benchmarking and analysis
- Test coverage reporting with configurable targets (95% for unit tests, 85% overall)
- Multiple test execution scripts:
  - `bin/test` - Quick Ruby unit tests
  - `bin/test:coverage` - Generate coverage reports for both Ruby and NPM
  - `bin/test:full` - Complete test suite (Ruby + NPM)
  - `bin/test:integration` - Integration tests for HTTP contracts
  - `bin/test:performance` - Performance benchmarks and analysis
  - `bin/test:report` - HTML and Markdown test reporting
  - `bin/test:watch` - Automated test watching with file change detection
- JSON schema validation for SSR requests and responses
- Mock utilities and test server generation for integration testing
- GitHub Actions CI workflow with matrix testing across supported Ruby and JavaScript runtime versions

#### Changed

- Updated `ssr_head` and `ssr_body` methods to return placeholders directly
- Simplified `ssr_streaming?` method implementation with controller delegation
- Updated development dependencies including Rails 7.2.2.1 and enhanced RuboCop configuration

#### Fixed

- Enhanced error handling and validation in streaming methods
- Improved integration test reliability with better server management

### NPM Package

#### Added

- **Hostname parameter**: `createServer` function now accepts an optional `hostname` parameter in `CreateServerOptions`
- Server configuration now supports custom hostname binding with runtime-default fallback behavior
- Comprehensive test suite using Vitest with React Testing Library
- Test dependencies: `@testing-library/jest-dom`, `@testing-library/react`, `jsdom`, `vitest`
- Coverage reporting configuration for NPM package tests
- Integration with Ruby gem testing framework for end-to-end validation

#### Changed

- Server console logging now displays the actual resolved hostname and port
- Simplified build scripts to focus on main entry point (`src/index.ts`)
- Streamlined watch command for development

#### Fixed

- Improved test stability and coverage reporting

### Documentation

#### Added

- CI status badge in README indicating GitHub Actions workflow status
- Comprehensive testing documentation (`spec/README.md`) covering:
  - Test directory structure and organization
  - Running tests for both Ruby and NPM components
  - Testing guidelines and best practices
  - Configuration details for RSpec and Vitest
  - Continuous Integration information

## 0.4.1 - 2025-05-21

### Ruby Gem

#### Added

- Introduced `UniversalRenderer::SSR::Response` value object to formalise the contract with the Node SSR service.
- `Client::Base.fetch` now returns a typed `SSR::Response` instance.
- `universal_renderer.rb` autoloads the new response object for application code.

#### Changed

- Renamed `Stream.stream` method to `Stream.call` for clearer intent
- Improved method visibility by removing underscore prefixes from internal methods
- Simplified error handling in streaming module
- Streamlined response handling for cleaner fallback to standard rendering
- Renamed SSR placeholder constant from `META` to `HEAD` for clearer semantics
- Renamed `use_ssr_streaming?` to `ssr_streaming?` for more explicit naming
- Error logging helpers in the streaming pipeline are now public and have descriptive names
- Bumped gem version constant and `Gemfile.lock` to `0.4.1`.

#### Fixed

- Fixed streaming failure detection and logging
- Improved error handling when SSR server is unavailable

### NPM Package

#### Added

- Native HTTP server support through the new `createServer` helper
- JSON rendering pipeline with `setup`, `render`, and `cleanup` lifecycle callbacks
- Streaming-specific hooks (`onReady`, `onChunk`, `onFinish`) for fine-grained control over React SSR
- Strongly-typed `ServerOptions` contract (`src/types/serverOptions.ts`) and internal `SSR_MARKERS` constants
- Development typings for the JavaScript runtime environment

#### Changed

- Reworked the package runtime strategy and dependency layout for a leaner SSR server
- Stream handler completely rewritten for stricter type-safety, meta-tag injection, and hardened error handling
- Build & watch scripts updated alongside peer-dependency changes
- Consolidated all exports into the top-level entry file; removed framework-specific sub-paths
- Error responses are now signalled only via status codes; bodies kept empty for smaller payloads
- Simplified error handling in stream handlers and improved graceful failure mode to allow Rails fallback
- Streamlined response handling and error reporting
- Cleaned up README SSR example by removing a redundant `<script id="state">` tag.

#### Removed

- `express` and `@types/express` dependencies
- Legacy files `staticHandler.ts`, `utils.ts`, and `types.ts`
- Deprecated `configureExpressApp` helper (renamed to `middleware` in 0.4.0)

#### Fixed

- Unhandled promise rejections when clients disconnected mid-stream
- Memory leak in the previous Express pipeline

## 0.4.0 - 2025-05-21

### Ruby Gem

#### Added

- Support for returning streaming status to enable fallback rendering

#### Changed

- Improved streaming implementation with simpler layout handling
- Removed direct header manipulation from renderable module
- Updated streaming API to return success/failure status
- Added trailing commas to multi-line logging statements

#### Fixed

- Fixed error handling in streaming mode

### NPM Package

#### Added

- CJS exports alongside ESM
- Streamlined React stream rendering with simplified API
- Support for custom middleware integration without Vite dependency

#### Changed

- Renamed `configureExpressApp` to `middleware`
- Renamed `onError` callback to `error` callback
- Simplified template handling for React streams
- Updated TypeScript types for better flexibility
- Build scripts now generate both ESM and CJS formats

#### Fixed

- Fixed hot module reloading for Vue components
- Resolved path resolution in Windows environments

#### Removed

- Vite dependency requirement in `createSsrServer`
- Removed mandatory Vite middleware usage
