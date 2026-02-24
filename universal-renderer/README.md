# universal-renderer (NPM)

SSR micro-server that pairs with the `universal_renderer` Ruby gem.

• **Runtime support** – Express HTTP + Bun/Node stdio support.
• **Framework-agnostic** – just start a server and hand it JSX/HTML.
• **Simple API** – minimal configuration, maximum flexibility.

## Installation

```bash
npm install universal-renderer
```

## Examples

### Node.js Setup

```ts
// ssr.ts
import { createServer } from "universal-renderer";
import { renderToString } from "react-dom/server.node";
import App from "./App";

const app = await createServer({
  setup: async (url, props) => {
    // Set up your app context - routing, state, etc.
    return {
      jsx: <App {...props} />,
      url,
      props
    };
  },
  render: async (context) => {
    // Render your React app to HTML
    const html = renderToString(context.jsx);

    return {
      head: '<meta name="description" content="SSR App">',
      body: html,
      bodyAttrs: 'class="ssr-rendered"'
    };
  },
  cleanup: (context) => {
    // Clean up any resources if needed
    console.log(`Rendered ${context.url}`);
  }
});

app.listen(3001, () => {
  console.log("SSR server running on http://localhost:3001");
});
```

### With Streaming (React 18+)

```ts
import { createServer } from "universal-renderer";

const app = await createServer({
  setup: async (url, props) => ({ url, props }),
  render: async (context) => ({ body: "fallback" }), // Required but not used for streaming
  streamCallbacks: {
    node: (context) => context.app,
    head: async (context) => {
      // Generate dynamic head content
      return `<meta name="description" content="Page: ${context.url}">`;
    },
  },
});
```

Point the gem at `http://localhost:3001` and you're done.

### Single Entrypoint (`ssr`)

If you want one SSR file that can run either stdio (for BunIo) or HTTP (for dev servers),
use `ssr`:

```ts
import { ssr } from "universal-renderer";

await ssr({
  setup: async (url, props) => ({ url, props }),
  render: async () => ({ body: "<div>Hello</div>" }),
});
```

Transport selection:
- `SSR_TRANSPORT=http` -> starts HTTP server (uses `SSR_PORT` or `3001`)
- default -> stdio renderer

## Framework Support

Universal Renderer supports Express HTTP and stdio runtimes (Node.js and Bun).

## React Query Helpers

For React apps that seed React Query cache data consistently across SSR and hydration,
you can use `universal-renderer/react-query`:

```ts
import {
  hydrateQueryClientFromProps,
} from "universal-renderer/react-query";
```

### Options

- `setup(url, props)` → `context` &mdash; prepare your app context.
- `render(context)` → `RenderOutput` &mdash; stringify markup.
- `cleanup(context)` (optional) &mdash; dispose per-request resources.
- `streamCallbacks` (optional) &mdash; for streaming SSR support.
- `middleware` (optional) &mdash; Framework-specific middleware for static assets, etc.
