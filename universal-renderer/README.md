# universal-renderer (NPM)

SSR micro-server that pairs with the `universal_renderer` Ruby gem.

• **Express-based** – lightweight and familiar Node.js server.
• **Framework-agnostic** – just start a server and hand it JSX/HTML.
• **Simple API** – minimal configuration, maximum flexibility.

## Installation

```bash
npm install universal-renderer
```

## Example

### Basic Setup

```ts
// ssr.ts
import { createServer } from "universal-renderer";
import { renderToString } from "react-dom/server.node";
import App from "./App";

const app = await createServer({
  port: 3001,
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
import { renderToPipeableStream } from "react-dom/server.node";

const app = await createServer({
  port: 3001,
  setup: async (url, props) => ({ url, props }),
  render: async (context) => ({ body: "fallback" }), // Required but not used for streaming
  streamCallbacks: {
    app: (context) => <App url={context.url} {...context.props} />,
    head: async (context) => {
      // Generate dynamic head content
      return `<meta name="description" content="Page: ${context.url}">`;
    }
  }
});
```

Point the gem at `http://localhost:3001` and you're done.

## API

### `createServer(options)`

Creates an Express application configured for SSR. Each request arrives as `{ url, props }` JSON and must respond with:

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
SSR_MARKERS.HEAD_TEMPLATE; // "{{SSR_HEAD}}"
SSR_MARKERS.BODY_TEMPLATE; // "{{SSR_BODY}}"
```

These markers are used by the Rails gem to inject SSR content into your templates. The `<!-- -->` versions are used in static HTML, while the `{{ }}` versions are used in streaming templates.

### Options

- `setup(url, props)` → `context` &mdash; prepare your app context.
- `render(context)` → `RenderOutput` &mdash; stringify markup.
- `cleanup(context)` (optional) &mdash; dispose per-request resources.
- `streamCallbacks` (optional) &mdash; for streaming SSR support.
- `middleware` (optional) &mdash; Express middleware for static assets, etc.

### Streaming (Optional)

For streaming SSR, provide `streamCallbacks`:

```ts
streamCallbacks: {
  app: (context) => <YourReactApp />,
  head?: (context) => "<meta name='description' content='...' />",
  transform?: (context) => someTransformStream,
  close?: (stream, context) => { /* cleanup */ }
}
```

For a full Rails + React walk-through, see the root repo README.
