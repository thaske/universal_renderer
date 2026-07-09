# universal-renderer (NPM)

SSR micro-server that pairs with the `universal_renderer` Ruby gem.

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

## Framework Support

Universal Renderer supports Express HTTP runtime with streaming SSR: pass
`streamCallbacks` to `createServer` and enable `enable_ssr streaming: true` in
the Rails controller.

### Options

- `setup(url, props)` → `context` &mdash; prepare your app context.
- `render(context)` → `RenderOutput` &mdash; stringify markup.
- `cleanup(context)` (optional) &mdash; dispose per-request resources.
- `streamCallbacks` (optional) &mdash; for streaming SSR support.
- `middleware` (optional) &mdash; Framework-specific middleware for static assets, etc.
