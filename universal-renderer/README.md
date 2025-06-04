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
npm install bun       # For Bun (usually Bun is the runtime, ensure @types/bun for TS)
npm install fastify   # For Fastify
npm install uWebSockets.js  # For uWebSockets.js (Node runtime only)
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

### Bun Setup

```ts
// ssr-bun.ts
import { createServer } from "universal-renderer/bun";
import { renderToString } from "react-dom/server"; // Or your preferred renderer
import App from "./App"; // Your main application component

async function startServer() {
  const serverConfig = await createServer({
    port: 3000, // Or your desired port
    setup: async (url, props) => {
      // Set up your app context - routing, state, etc.
      // This context is passed to render and cleanup
      return {
        jsx: <App {...props} url={url} />, // Example: pass url and props to your App
        url,
        props,
        // Example: initialize a store or other request-specific resources
        // store: createMyStore(),
      };
    },
    render: async (context) => {
      // Render your React (or other framework) app to HTML
      const html = renderToString(context.jsx);

      return {
        // Optional: HTML content for the <head>
        head: '<meta name="description" content="My Bun SSR App">',
        // Required: The main rendered HTML body content
        body: html,
        // Optional: Attributes for the <body> tag
        bodyAttrs: 'class="bun-ssr-rendered"'
      };
    },
    cleanup: (context) => {
      // Clean up any resources if needed (e.g., close store connections)
      console.log(`Rendered ${context.url} with Bun`);
      // context.store?.dispose();
    }
  });

  Bun.serve(serverConfig);
  console.log(`Bun SSR server running on http://localhost:${serverConfig.port}`);
}

startServer();
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
- **Bun**: `import { createServer } from "universal-renderer/bun"`

All frameworks provide a similar API surface, allowing you to switch between them with minimal changes to your SSR logic. Choose based on your deployment target:

- **Express.js**: Traditional Node.js environments
- **Hono**: Edge environments (Cloudflare Workers, Deno, Bun with Hono adapter)
- **Bun**: Native Bun environments using `Bun.serve`

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
