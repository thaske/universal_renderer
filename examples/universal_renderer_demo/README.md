# UniversalRenderer Demo

This app is a minimal integration example for the `universal_renderer` gem.

It uses:
- Ruby on Rails
- `vite_rails`
- Bun
- React
- `styled-components`
- `@tanstack/react-query`
- `universal_renderer` (local path gem from this repository)

## First-time setup

```bash
bundle install
~/.bun/bin/bun install
```

## Run the demo

Run from this folder:

```bash
bin/dev
```

Then open `http://127.0.0.1:3000`.

This demo uses `config.engine = :http` and runs a dedicated
Node + Express SSR server via Vite middleware from `app/frontend/ssr/ssr.tsx`.
SSR setup/render handlers are defined in `app/frontend/ssr/setup.tsx`.

In development, `bin/dev` runs that Node+Express SSR server directly from
`Procfile.dev`. For BunIo production workflows, the stdio SSR entrypoint
remains `app/frontend/ssr/ssr.tsx`.

For production BunIo, Rails executes the Vite-built SSR bundle at
`public/vite-ssr/ssr.js` (built from `app/frontend/ssr/ssr.tsx`).

It uses shared helpers from `universal-renderer/react-query` to:
- keep query-cache seeding logic aligned between SSR and hydration

## Production build note

When deploying with BunIo in production, make sure SSR bundle output exists:

```bash
bun run build
# or at minimum:
bun run build:ssr
```

To test larger SSR payloads and more query seed data, use:
- `http://127.0.0.1:3000/?records=50&size_kb=16`
- `http://127.0.0.1:3000/?records=500&size_kb=128`
- `http://127.0.0.1:3000/?records=1000&size_kb=256`

## What to look for

- SSR HTML is injected into `#root` by Rails via `ssr_body`.
- `<meta name="ssr-rendered-at">` is injected via `ssr_head`.
- React hydrates the same component on the client via `app/frontend/entrypoints/application.tsx`.
