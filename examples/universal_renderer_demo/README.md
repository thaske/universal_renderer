# Rails + Vite + Bun Demo

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

1. Start the SSR server (Bun):
```bash
~/.bun/bin/bun run app/frontend/ssr/server.tsx
```

2. Start Rails:
```bash
bundle exec rails s
```

3. (Optional) Start Vite dev server:
```bash
~/.bun/bin/bun run dev
```

Then open `http://127.0.0.1:3000`.

## What to look for

- SSR HTML is injected into `#root` by Rails via `ssr_body`.
- `<meta name="ssr-rendered-at">` is injected via `ssr_head`.
- React hydrates the same component on the client via `app/frontend/entrypoints/application.tsx`.
