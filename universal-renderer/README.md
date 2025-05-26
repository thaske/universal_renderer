# universal-renderer (NPM)

SSR micro-server that pairs with the `universal_renderer` Ruby gem.

• **Multi-framework** – Express.js and Hono support out of the box.
• **Framework-agnostic** – just start a server and hand it JSX/HTML.
• **Simple API** – minimal configuration, maximum flexibility.

## Installation

```bash
npm install universal-renderer
# Also install your preferred web framework:
npm install express   # For Express.js
npm install hono      # For Hono
```

## Examples

### Express.js Setup

```ts
// ssr-express.ts
import { createServer } from "universal-renderer/express";
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

### Hono Setup

```ts
// ssr-hono.ts
import { createServer } from "universal-renderer/hono";
import { renderToString } from "react-dom/server.node";
import App from "./App";

const app = await createServer({
  setup: async (url, props) => {
    return {
      jsx: <App {...props} />,
      url,
      props
    };
  },
  render: async (context) => {
    const html = renderToString(context.jsx);
    return {
      head: '<meta name="description" content="SSR App">',
      body: html,
      bodyAttrs: 'class="ssr-rendered"'
    };
  },
  cleanup: (context) => {
    console.log(`Rendered ${context.url}`);
  }
});

// Hono usage varies by runtime:
// export default app; // for Cloudflare Workers
// Bun.serve({ fetch: app.fetch }); // for Bun
```

### With Streaming (React 18+)

```ts
import { createServer } from "universal-renderer/express"; // or /hono

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

## Framework Support

Universal Renderer supports multiple web frameworks through subpath imports:

- **Express.js**: `import { createServer } from "universal-renderer/express"`
- **Hono**: `import { createServer } from "universal-renderer/hono"`

Both frameworks provide the same API surface, allowing you to switch between them without changing your SSR logic. Choose based on your deployment target:

- **Express.js**: Traditional Node.js environments
- **Hono**: Edge environments (Cloudflare Workers, Bun, Deno)

## API

### `createServer(options)`

Creates a web application configured for SSR. Each request arrives as `{ url, props }` JSON and must respond with:

```ts
export type RenderOutput = {
  head?: string; // <head> inner HTML
  body: string; // rendered markup (required)
  bodyAttrs?: string; // optional attributes for <body>
};
```

### SSR Markers

The library exports marker constants for template placeholders:

```ts
import { SSR_MARKERS } from "universal-renderer";

// Available markers:
SSR_MARKERS.HEAD; // "<!-- SSR_HEAD -->"
SSR_MARKERS.BODY; // "<!-- SSR_BODY -->"
```

These markers are used by the Rails gem to inject SSR content into your templates.

### Options

- `setup(url, props)` → `context` &mdash; prepare your app context.
- `render(context)` → `RenderOutput` &mdash; stringify markup.
- `cleanup(context)` (optional) &mdash; dispose per-request resources.
- `streamCallbacks` (optional) &mdash; for streaming SSR support.
- `middleware` (optional) &mdash; Framework-specific middleware for static assets, etc.

### Streaming (Optional)

For streaming SSR, provide `streamCallbacks`:

```ts
streamCallbacks: {
  node: (context) => <YourReactApp />,
  head?: (context) => "<meta name='description' content='...' />",
  transform?: (context) => someTransformStream
}
```

For a full Rails + React walk-through, see the root repo README.
