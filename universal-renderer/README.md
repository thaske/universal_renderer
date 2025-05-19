# universal-renderer

**Note:** This package is the Node.js/Express based Server-Side Rendering (SSR) server component for the [`universal_renderer` Ruby gem](https://github.com/thaske/universal_renderer). The Ruby gem is installed in a Rails application and forwards rendering requests to a server running this Node.js package.

A flexible and customizable server for Server-Side Rendering (SSR) of JavaScript applications, built with Express and Vite. This server is designed to be adaptable to various frontend libraries and SSR strategies through a powerful callback system.

## Features

- **Framework Agnostic Core**: The core is designed to support any SSR setup through a flexible callback system.
- **Vite-Powered**: Leverages Vite for fast HMR during development and efficient module loading.
- **Static & Streaming SSR**: Supports both static rendering and `renderToPipeableStream` (streaming) out of the box.
- **Customizable Rendering Lifecycle**: Use `RenderCallbacks` to integrate your specific libraries for routing, state management, styling, and metadata.
- **Type-Safe Customization**: Generic types for `SetupResultBase` and `RenderCallbacks` ensure type safety even with complex custom setups.
- **Default React Setup**: Includes pre-configured callbacks for common React ecosystems (React Router, React Helmet Async, React Query, Styled Components).

## Installation

```bash
# Using npm
npm install universal-renderer

# Using yarn
yarn add universal-renderer
```

## Core Concepts

### `createSsrServer(options)`

This is the main function to create and configure your SSR server. It returns an Express app instance.

- `options`: An object of type `CreateSsrServerOptions<TContext>`:
  - `vite`: A `ViteDevServer` instance (required).
  - `coreCallbacks`: An object implementing `CoreRenderCallbacks<TContext>`. These are essential for app setup and cleanup, common to all rendering strategies.
  - `streamCallbacks?`: Optional object implementing `StreamSpecificCallbacks<TContext>`. Required if you want to use streaming SSR.
  - `staticCallbacks?`: Optional object implementing `StaticSpecificCallbacks<TContext>`. Required if you want to use static SSR.
  - `basePath?`: Base path for the application (defaults to `/`).
  - `configureExpressApp?`: Optional function `(app: Express, vite: ViteDevServer) => void | Promise<void>` to customize the Express app instance before SSR routes and default middleware are added.

### Render Callback Interfaces

The rendering lifecycle is controlled by a set of callback interfaces. `TContext` is a generic type representing the data structure your `setup` callback returns and other callbacks consume. It must extend `RenderContextBase`.

#### `RenderContextBase`

The base interface for the context object returned by `setup`. Your custom context must extend this.
It requires `jsx: React.ReactElement` (or your framework's equivalent component representation) and allows any other properties: `[key: string]: any;`.

#### `CoreRenderCallbacks<TContext extends RenderContextBase>`

These callbacks are fundamental and used by both static and streaming rendering.

- `setup(requestUrl: string, props: Record<string, any>) => Promise<TContext | undefined> | TContext | undefined`:

  - Initializes your app with necessary providers (e.g., Router, State Manager, Style Collectors).
  - `requestUrl`: The current request URL.
  - `props`: Props passed in the request body.
  - **Must return an object that includes at least `jsx: React.ReactElement`**. This object is your `TContext`. Can also return `undefined` if setup fails.

- `cleanup(context: TContext) => void`:
  - Performs any necessary cleanup after rendering (e.g., sealing style sheets, clearing query client caches). Called for both successful renders and in error scenarios.
- `onError?(error: Error | unknown, context?: TContext, errorContext?: string) => void`:
  - Optional. Called when an error occurs during any stage of the rendering lifecycle.
  - `error`: The error object.
  - `context`: The `TContext` object, if available.
  - `errorContext`: A string describing where the error occurred.

#### `StreamSpecificCallbacks<TContext extends RenderContextBase>`

These callbacks are used only for the streaming rendering strategy.

- `onResponseStart?(res: Response, context: TContext) => Promise<void> | void`:
  - Optional. Called once before any part of the HTML document is written to the response for streaming.
  - Useful for setting custom headers or performing other initial setup on the response.
- `onWriteMeta?(res: Response, context: TContext) => Promise<void> | void`:
  - Optional. Called after the initial part of the HTML (before where meta tags would go) has been written to the response. This is the ideal place to write meta tags or other head elements.
- `createResponseTransformer?(context: TContext) => Transform | undefined`:
  - Optional. Creates a Node.js `Transform` stream to pipe the React render stream through.
  - Useful for injecting styles (e.g., from Styled Components) or other stream transformations.
- `onBeforeWriteClosingHtml?(res: Response, context: TContext) => Promise<void> | void`:
  - Optional. Called after the main React content stream has finished, but _before_ the final closing HTML tags are written.
- `onResponseEnd?(res: Response, context: TContext) => Promise<void> | void`:
  - Optional. Called after the HTTP response has been fully sent and ended for a streamed response.
  - Useful for logging or final resource cleanup related to the response.

#### `StaticSpecificCallbacks<TContext extends RenderContextBase, TRenderOutput extends Record<string, any> = Record<string, any>>`

This callback is used only for the static HTML rendering strategy.

- `render(context: TContext) => Promise<TRenderOutput> | TRenderOutput`:
  - Renders the application to a static representation.
  - The `jsx` for rendering is typically `context.jsx`.
  - **Must return an object (or a Promise resolving to an object) of type `TRenderOutput`. The structure of this object is defined by you.** For example, it could be `{ meta: string, body: string }` for simple HTML string rendering, or any other structure suitable for your needs.

## Basic Usage (Custom Setup)

Here's a conceptual example of setting up the server with minimal custom callbacks for a React application.

```typescript
// server.ts
import express from "express";
import {
  createSsrServer,
  type RenderContextBase,
  type CoreRenderCallbacks,
  type StreamSpecificCallbacks,
  type StaticSpecificCallbacks,
} from "universal-renderer";
import { renderToString } from "react-dom/server"; // For static
// import { renderToPipeableStream } from "react-dom/server"; // For stream (setup shown in streamHandler.ts)
import type { ViteDevServer } from "vite";
import type { Response } from "express"; // For callback signatures
import type { Transform } from "node:stream"; // For createResponseTransformer
import http from "node:http"; // For example server
import { createServer as createViteServer } from "vite"; // For example

// Define the structure for your custom context
interface MyCustomContext extends RenderContextBase {
  // Example: Add custom data needed by other callbacks
  appName: string;
}

// Define the structure for your static render output if you want to be specific
interface MyStaticRenderOutput {
  meta: string;
  body: string;
}

const myCoreCallbacks: CoreRenderCallbacks<MyCustomContext> = {
  async setup(requestUrl: string, props: Record<string, any>) {
    // Basic JSX setup. In a real app, you'd wrap App with
    // Routers, Context Providers (State, Helmet, Styles), etc.
    // For this example, we'll imagine a simple App component.
    const jsx = React.createElement(
      "div",
      null,
      `App for ${requestUrl} with props: ${JSON.stringify(props)}`,
    );
    return { jsx, appName: "My Universal App" };
  },
  cleanup(context) {
    console.log(`Cleanup for ${context.appName}`);
  },
  onError(error, context, errorContext) {
    console.error(
      `Error during ${errorContext} for ${context?.appName}:`,
      error,
    );
  },
};

const myStreamCallbacks: StreamSpecificCallbacks<MyCustomContext> = {
  async onResponseStart(res, context) {
    console.log(`Stream starting for ${context.appName}`);
    // res.setHeader("X-Custom-Header", "Streaming Started");
  },
  async onWriteMeta(res, context) {
    // Example: Generate meta tags
    res.write(`<title>${context.appName}</title>`);
    res.write(
      `<meta name="description" content="Streamed with ${context.appName}">`,
    );
  },
  // createResponseTransformer can be added here if needed
  async onBeforeWriteClosingHtml(res, context) {
    // Example: Write some data before HTML closes
    // res.write(`<script>console.log("Stream almost done for ${context.appName}");</script>`);
  },
  async onResponseEnd(res, context) {
    console.log(`Stream ended for ${context.appName}`);
  },
};

const myStaticCallbacks: StaticSpecificCallbacks<
  MyCustomContext,
  MyStaticRenderOutput
> = {
  async render(context): Promise<MyStaticRenderOutput> {
    const body = renderToString(context.jsx);
    return {
      meta: `<title>${context.appName}</title><meta name="description" content="Static ${context.appName}">`,
      body,
    };
  },
};

async function startServer() {
  // Create a Vite dev server
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom", //important for SSR
  });

  const app = await createSsrServer<MyCustomContext>({
    vite, // Pass the Vite instance
    coreCallbacks: myCoreCallbacks,
    streamCallbacks: myStreamCallbacks, // Provide if streaming is needed
    staticCallbacks: myStaticCallbacks, // Provide if static rendering is needed
    basePath: "/app", // Optional: if your app is not at the root
    configureExpressApp: (expressApp, viteDevServer) => {
      // Optional: add custom middleware or routes to Express
      expressApp.use("/custom-route", (req, res) => res.send("Custom Route!"));
    },
  });

  const port = process.env.PORT || 3000;
  http.createServer(app).listen(port, () => {
    // Use app from createSsrServer
    console.log(`SSR server started on http://localhost:${port}`);
  });
}

// Dummy React for example to run, replace with actual React import
const React = {
  createElement: (type: any, props: any, ...children: any[]) => ({
    type,
    props,
    children,
  }),
};

startServer();
```

## Server Endpoints

The server exposes the following POST endpoints (paths are relative to the `basePath` option):

- `/` or `/static`: For static SSR.
  - Request body: `{ "url": string, "props"?: Record<string, any> }`
  - Response: JSON object (`TRenderOutput`) whose structure is determined by your `staticCallbacks.render` implementation (e.g., `{ meta: string, body: string }`).
- `/stream`: For streaming SSR.
  - Request body: `{ "url": string, "props"?: Record<string, any>, "template": string }`
  - Response: HTML stream.

It also exposes a GET endpoint for health checks:

- `/health` (relative to `basePath`): Returns `{ status: "OK", timestamp: "..." }`

## HTML Template for Streaming

When using streaming (`/stream` endpoint), your backend (e.g., Rails) needs to provide an HTML template string in the `template` field of the request body.
The server, particularly the `streamHandler`, will process this template.

The HTML template **must** include these markers for content injection:

- `<!-- SSR_META -->`: Where metadata (e.g., `<title>`, `<meta>` tags, often written via `streamCallbacks.onWriteMeta`) will be injected. Your provided template should have this marker. The part of the template _before_ `<!-- SSR_META -->` is written first.
- `<!-- SSR_BODY -->`: Where the main application content will be streamed. The part of the template _between_ `<!-- SSR_META -->` and `<!-- SSR_BODY -->` is written after `onWriteMeta` completes, and then the React stream is piped into this location. The part _after_ `<!-- SSR_BODY -->` is written once the React stream ends (after `onBeforeWriteClosingHtml`).

The `parseLayoutTemplate` utility in `universal-renderer` splits the provided `template` string using these markers to construct the response.

Example structure of an HTML template provided in the request:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- SSR_META -->
  </head>
  <body>
    <div id="root"><!-- SSR_BODY --></div>
    <!-- Client-side JS bundles, state scripts, etc., would be part of the template sections -->
    <!-- or injected via callbacks like onBeforeWriteClosingHtml -->
  </body>
</html>
```

## Vite Configuration

The server uses Vite internally with a pre-configured setup optimized for SSR. Direct customization of the Vite configuration via `createSsrServer` options is not currently supported. Vite's middleware mode is used to handle module loading and HMR during development.

## Advanced Customization

The power of `universal-renderer` lies in its callback system (`CoreRenderCallbacks`, `StreamSpecificCallbacks`, `StaticSpecificCallbacks`). By implementing these interfaces and defining your own `TContext` extending `RenderContextBase`, you can integrate virtually any JavaScript library or framework for SSR. This allows you to manage complex state, custom styling solutions, or unique routing requirements while leveraging the robust server infrastructure provided.
