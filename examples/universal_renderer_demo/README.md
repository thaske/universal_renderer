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

Run these in separate terminals from this folder:

1. Start Rails:
```bash
bun run build:ssr && bundle exec rails s
```

2. (Optional) Start Vite dev server:
```bash
~/.bun/bin/bun run dev
```

Then open `http://127.0.0.1:3000`.

This demo uses the `:bun_io` engine (persistent Open3-managed Bun processes) and
executes the Vite-built SSR bundle at `public/vite-ssr/ssr.js` (built from
`app/frontend/ssr/ssr.tsx`) so SSR and client use the same Vite pipeline.

To test larger SSR payloads and more query seed data, use:
- `http://127.0.0.1:3000/?records=50&size_kb=16`
- `http://127.0.0.1:3000/?records=500&size_kb=128`
- `http://127.0.0.1:3000/?records=1000&size_kb=256`

## What to look for

- SSR HTML is injected into `#root` by Rails via `ssr_body`.
- `<meta name="ssr-rendered-at">` is injected via `ssr_head`.
- React hydrates the same component on the client via `app/frontend/entrypoints/application.tsx`.
