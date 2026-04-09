# UniversalRenderer Demo

This app is a minimal integration example for the `universal_renderer` gem.

It uses:
- Ruby on Rails
- `vite_rails`
- npm
- Node.js
- React
- `styled-components`
- `@tanstack/react-query`
- `universal_renderer` (local path gem from this repository)

## First-time setup

```bash
bundle install
npm install
```

This demo uses npm for package scripts and Vite builds, and Bun for the
production stdio SSR process.

## Run the demo

Run from this folder:

```bash
bin/dev
```

Then open `http://127.0.0.1:3000`.

This demo uses:
- `:http` engine in development/test (`app/frontend/ssr/ssr.tsx`)
- `:stdio` engine in production (`app/frontend/ssr/stdio.tsx`)

SSR setup/render handlers are shared in `app/frontend/ssr/setup.tsx`.

In development, `bin/dev` runs the Node+Express SSR server from
`app/frontend/ssr/ssr.tsx` via `Procfile.dev`.

In production, Rails executes the Vite-built stdio bundle at
`public/vite-ssr/stdio.js` with Bun (built from
`app/frontend/ssr/stdio.tsx`).

It uses shared helpers from `universal-renderer/react-query` to:
- keep query-cache seeding logic aligned between SSR and hydration

## Production build note

When deploying with Stdio in production, make sure SSR bundle output exists:

```bash
npm run build
# or at minimum:
npm run build:ssr
```

To run the built stdio bundle directly, use:

```bash
bun public/vite-ssr/stdio.js
```

To test larger SSR payloads and more query seed data, use:
- `http://127.0.0.1:3000/?records=50&size_kb=16`
- `http://127.0.0.1:3000/?records=500&size_kb=128`
- `http://127.0.0.1:3000/?records=1000&size_kb=256`

## What to look for

- SSR HTML is injected into `#root` by Rails via `ssr_body`.
- `<meta name="ssr-rendered-at">` is injected via `ssr_head`.
- React hydrates the same component on the client via `app/frontend/entrypoints/application.tsx`.
