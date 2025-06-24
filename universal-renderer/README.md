# universal-renderer (NPM)

SSR micro-server that pairs with the `universal_renderer` Ruby gem.

• **Multi-framework** – Node.js and Bun support out of the box.
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

### Bun Setup (recommended)

```ts
// ssr-bun.ts
import { createServer } from "universal-renderer";
import { renderToString } from "react-dom/server.node";
import App from "./App";

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

## Framework Support

Universal Renderer supports multiple runtimes through subpath imports (Node.js and Bun).

### Options

- `setup(url, props)` → `context` &mdash; prepare your app context.
- `render(context)` → `RenderOutput` &mdash; stringify markup.
- `cleanup(context)` (optional) &mdash; dispose per-request resources.
- `streamCallbacks` (optional) &mdash; for streaming SSR support.
- `middleware` (optional) &mdash; Framework-specific middleware for static assets, etc.
