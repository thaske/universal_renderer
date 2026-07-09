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
bun install
```

This demo uses Bun for package management, Vite scripts, and the external HTTP
SSR process.

## Run the demo

Run from this folder:

```bash
bin/dev
```

Then open `http://127.0.0.1:3000`.

This demo uses the external HTTP SSR server with streaming enabled. The Rails
app sends render requests to `http://localhost:5200`.

SSR setup/render handlers are shared in `app/frontend/ssr/setup.tsx`.

The HTTP SSR server is run from `app/frontend/ssr/ssr.tsx` via `Procfile.dev`.
For a production-style run, build and start `public/vite-ssr-http/ssr.js` with
Bun and set `UNIVERSAL_RENDERER_URL` to its address.

## Production build note

When deploying the HTTP SSR server, make sure the SSR bundle output exists:

```bash
bun run build
# or at minimum:
bun run build:ssr
```

To run the built HTTP bundle directly, use:

```bash
bun public/vite-ssr-http/ssr.js
```

To test larger SSR payloads and more query seed data, use:

- `http://127.0.0.1:3000/?records=50&size_kb=16`
- `http://127.0.0.1:3000/?records=500&size_kb=128`
- `http://127.0.0.1:3000/?records=1000&size_kb=256`

## What to look for

- SSR HTML is injected into `#root` by Rails via `ssr_body`.
- `<meta name="ssr-rendered-at">` is injected via `ssr_head`.
- React hydrates the same component on the client via `app/frontend/entrypoints/application.tsx`.
