# universal-renderer (NPM)

SSR micro-server that pairs with the `universal_renderer` Ruby gem.

• **Bun-only** – requires Bun ≥ 1.2.
• **Framework-agnostic** – just start a server and hand it JSX/HTML.

## Installation

```bash
bun add universal-renderer
```

## Example

```ts
// ssr.ts
import { createServer } from "universal-renderer";
import { renderToString } from "react-dom/server.node";
import App from "./App";

await createServer({
  port: 3001,
  setup: (await import("./setup")).default,
  render: ({ app }) => ({ body: renderToString(app) }),
});
```

Point the gem at `http://localhost:3001` and you're done.

## API

`createServer(options)` spins up a Bun router.
Each request arrives as `{ url, props }` JSON and must respond with:

```ts
export type RenderOutput = {
  head?: string; // <head> inner HTML
  body: string; // rendered markup (required)
  bodyAttrs?: string; // optional attributes for <body>
};
```

`options`:

- `setup(url, props)` → `{ jsx, ...ctx }` &mdash; prepare the app.
- `render({ app, ...ctx })` → `RenderOutput` &mdash; stringify markup.
- `cleanup(ctx)` (optional) &mdash; dispose per-request resources.

Need streaming or Vite middleware? Check `src/index.ts`.

For a full Rails + React walk-through, see the root repo README.
