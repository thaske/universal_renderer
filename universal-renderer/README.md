# universal-renderer

**Note:** This package is the Node.js/Express based Server-Side Rendering (SSR) server component for the [`universal_renderer` Ruby gem](https://github.com/thaske/universal_renderer). The Ruby gem is installed in a Rails application and forwards rendering requests to a server running this Node.js package.

A flexible and customizable server for Server-Side Rendering (SSR) of JavaScript applications, built with Express and Vite. This server is designed to be adaptable to various frontend libraries and SSR strategies through a powerful callback system.

## Features

- **Framework Agnostic Core**: While defaults are provided for React, the core is designed to support any SSR setup.
- **Vite-Powered**: Leverages Vite for fast HMR during development and efficient module loading.
- **Static & Streaming SSR**: Supports both `renderToString` (static) and `renderToPipeableStream` (streaming) out of the box.
- **Customizable Rendering Lifecycle**: Use `RenderCallbacks` to integrate your specific libraries for routing, state management, styling, and metadata.
- **Type-Safe Customization**: Generic types for `AppSetupResult` and `RenderCallbacks` ensure type safety even with complex custom setups.
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

- `options`: An object of type `CreateSsrServerOptions<TSetupResult>`:
  - `appEntryPath`: Absolute path to your application's main entry file (e.g., `src/main.tsx`). This file should export user components and potentially other functions needed by `setup`.
  - `coreCallbacks`: An object implementing `CoreRenderCallbacks<TSetupResult>`. These are essential for app setup and cleanup, common to all rendering strategies.
  - `streamCallbacks?`: Optional object implementing `StreamSpecificCallbacks<TSetupResult>`. Required if you want to use streaming SSR.
  - `staticCallbacks?`: Optional object implementing `StaticSpecificCallbacks<TSetupResult>`. Required if you want to use static SSR.
  - `basePath?`: Base path for the application (defaults to `/`).
  - `configureExpressApp?`: Optional function `(app: Express, vite: ViteDevServer) => void | Promise<void>` to customize the Express app instance before SSR routes and default middleware are added.

### Render Callback Interfaces

The rendering lifecycle is controlled by a set of callback interfaces. `TSetupResult` is a generic type representing the data structure your `setup` callback returns and other callbacks consume. It must extend `AppSetupResultBase`.

#### `AppSetupResultBase`

The base interface for the result of `setup`. Your custom setup result must extend this.
It requires `jsx: React.ReactElement` (or your framework's equivalent component representation) and allows any other properties: `[key: string]: any;`.

#### `CoreRenderCallbacks<TSetupResult extends AppSetupResultBase>`

These callbacks are fundamental and used by both static and streaming rendering.

- `setup(appModule: UserAppModule, props: Record<string, any>, requestUrl: string, viteDevServer: ViteDevServer) => Promise<TSetupResult> | TSetupResult`:

  - Initializes your app with necessary providers (e.g., Router, State Manager, Style Collectors).
  - `appModule`: The loaded module from `appEntryPath`.
  - `props`: Props passed in the request body.
  - `requestUrl`: The current request URL.
  - `viteDevServer`: The Vite dev server instance.
  - **Must return an object that includes at least `jsx: React.ReactElement`**. This object is your `TSetupResult`.

- `cleanup(setupResult: TSetupResult) => void`:
  - Performs any necessary cleanup after rendering (e.g., sealing style sheets, clearing query client caches). Called for both successful renders and in error scenarios.

#### `StreamSpecificCallbacks<TSetupResult extends AppSetupResultBase>`

These callbacks are used only for the streaming rendering strategy.

- `getShellContext?(setupResult: TSetupResult) => Promise<{ meta?: string; state?: any }> | { meta?: string; state?: any }`:
  - Optional. Called after `setup` and before streaming begins.
  - Use this to prepare context like meta tags (as an HTML string) or initial state (JSON-serializable) that will be embedded in the HTML shell.
- `onResponseStart?(res: Response, setupResult: TSetupResult, shellContext: { meta?: string; state?: any }) => Promise<void> | void`:
  - Optional. Called once before any part of the HTML document is written to the response for streaming.
  - Useful for setting custom headers or performing other initial setup on the response.
- `createResponseTransformer?(setupResult: TSetupResult) => Transform | undefined`:
  - Optional. Creates a Node.js `Transform` stream to pipe the React render stream through.
  - Useful for injecting styles (e.g., from Styled Components) or other stream transformations.
- `onBeforeWriteClosingHtml?(res: Response, setupResult: TSetupResult, shellContext: { meta?: string; state?: any }) => Promise<void> | void`:
  - Optional. Called after the main React content stream has finished, but _before_ the HTML parts containing the state script and the final closing HTML tags are written.
- `onResponseEnd?(res: Response, setupResult: TSetupResult) => Promise<void> | void`:
  - Optional. Called after the HTTP response has been fully sent and ended for a streamed response.
  - Useful for logging or final resource cleanup related to the response.

#### `StaticSpecificCallbacks<TSetupResult extends AppSetupResultBase>`

This callback is used only for the static HTML rendering strategy.

- `render(setupResult: TSetupResult) => Promise<StaticRenderResult> | StaticRenderResult`:
  - Renders the application to a static representation.
  - The `jsx` for rendering is typically `setupResult.jsx`.
  - **Must return an object of type `StaticRenderResult` containing `meta: string`, `body: string`, `styles: string`, and `state: Record<string, any> | null`**.

## Basic Usage (Custom Setup)

Here's a conceptual example of setting up the server with minimal custom callbacks for a React application.

```typescript
// server.ts
import express from "express";
import {
  createSsrServer,
  type AppSetupResultBase,
  type CoreRenderCallbacks,
  type StreamSpecificCallbacks,
  type StaticSpecificCallbacks,
  type UserAppModule,
  type StaticRenderResult,
} from "universal-renderer";
import { renderToString } from "react-dom/server"; // For static
import { renderToPipeableStream } from "react-dom/server"; // For stream
import path from "node:path";
import type { ViteDevServer } from "vite";
import type { Request, Response } from "express"; // For callback signatures
import type { Transform } from "node:stream"; // For createResponseTransformer

interface MyCustomSetupResult extends AppSetupResultBase {
  // Example: Add custom data needed by other callbacks
  appName: string;
}

const myCoreCallbacks: CoreRenderCallbacks<MyCustomSetupResult> = {
  async setup(
    appModule: UserAppModule,
    props: Record<string, any>,
    requestUrl: string,
    viteDevServer: ViteDevServer
  ) {
    // Assuming appModule.default is your main React component
    const App = appModule.default || (() => "Error: App not found");

    // Basic JSX setup. In a real app, you'd wrap App with
    // Routers, Context Providers (State, Helmet, Styles), etc.
    const jsx = <App {...props} requestUrl={requestUrl} />;
    return { jsx, appName: "My Universal App" };
  },
  cleanup(setupResult) {
    console.log(`Cleanup for ${setupResult.appName}`);
  },
};

const myStreamCallbacks: StreamSpecificCallbacks<MyCustomSetupResult> = {
  async getShellContext(setupResult) {
    // Example: Generate meta tags and initial state
    return {
      meta: `<title>${setupResult.appName}</title><meta name="description" content="Streamed with ${setupResult.appName}">`,
      state: { initialMessage: `Welcome to ${setupResult.appName} (streamed)` },
    };
  },
  // Implement other stream callbacks as needed (onResponseStart, createResponseTransformer, etc.)
};

const myStaticCallbacks: StaticSpecificCallbacks<MyCustomSetupResult> = {
  async render(setupResult): Promise<StaticRenderResult> {
    // In a real app, you'd use libraries for meta, styles, and state.
    // e.g., Helmet for meta, Styled Components for styles.
    const body = renderToString(setupResult.jsx);
    return {
      meta: `<title>${setupResult.appName}</title><meta name="description" content="Static ${setupResult.appName}">`,
      body,
      styles: "<style>body { font-family: sans-serif; }</style>", // Example static styles
      state: { initialMessage: `Welcome to ${setupResult.appName} (static)` },
    };
  },
};

async function startServer() {
  const app = await createSsrServer<MyCustomSetupResult>({
    appEntryPath: path.resolve(__dirname, "src/main.tsx"), // Adjust to your app entry
    coreCallbacks: myCoreCallbacks,
    streamCallbacks: myStreamCallbacks, // Provide if streaming is needed
    staticCallbacks: myStaticCallbacks, // Provide if static rendering is needed
    basePath: "/app", // Optional: if your app is not at the root
    configureExpressApp: (expressApp, viteDevServer) => {
      // Optional: add custom middleware or routes to Express
      expressApp.use("/custom-route", (req, res) => res.send("Custom Route!"));
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`SSR server started on http://localhost:${port}`);
  });
}

startServer();
```

## Using Default React Callbacks

For common React applications using React Router, React Helmet Async, React Query, and Styled Components, `universal-renderer` provides `createDefaultReactCallbacks`.

### `createDefaultReactCallbacks(options?)`

- `options`: An object of type `DefaultReactCallbacksOptions`:
  - `metadataComponentPath?`: Path to a module exporting a `Metadata` React component for more complex helmet setups.
  - `queryClient?`: A `QueryClient` instance or a function `() => QueryClient` for React Query.
  - `staticRouterProps?`: A function `(pathname: string) => Record<string, any>` to customize props for React Router's `StaticRouter` (e.g., `basename`).

The `setup` in default callbacks returns `DefaultReactAppSetupResult`, which includes:

- `helmetContext: HelmetContext`
- `queryClient: QueryClient`
- `styleSheet: ServerStyleSheet` (from Styled Components)

### Example with Default React Callbacks:

```typescript
// server.ts
import {
  createSsrServer,
  createDefaultReactCallbacks,
} from "universal-renderer";
import path from "node:path";

async function startServer() {
  const app = await createSsrServer({
    // TSetupResult defaults to DefaultReactAppSetupResult
    port: 3000,
    appEntryPath: path.resolve(__dirname, "src/main.tsx"), // Your React app entry
    renderCallbacks: createDefaultReactCallbacks({
      // Optional: customize query client or router props
      // queryClient: () => new QueryClient({...}),
      // staticRouterProps: (pathname) => ({ basename: '/app' })
    }),
    htmlTemplatePath: path.resolve(__dirname, "public/index.html"), // For streaming
  });

  app.listen(3000, () => {
    console.log("React SSR server started on http://localhost:3000");
  });
}

startServer();
```

## Server Endpoints

The server exposes the following POST endpoints (paths are relative to the `basePath` option):

- `/` or `/static`: For static SSR.
  - Request body: `{ "url": string, "props"?: Record<string, any> }`
  - Response: JSON `StaticRenderResult { meta, body, styles, state }`
- `/stream`: For streaming SSR.
  - Request body: `{ "url": string, "props"?: Record<string, any> }`
  - Response: HTML stream.

It also exposes a GET endpoint for health checks:

- `/health` (relative to `basePath`): Returns `{ status: "OK", timestamp: "..." }`

## HTML Template for Streaming

When using streaming (`/stream` endpoint), you need an HTML template. The server determines the template using `getHtmlTemplate` utility:

1.  If `_railsLayoutHtml` property is present in the `props` of the request body, it will be used. This is useful when integrating with Ruby on Rails.
2.  Otherwise, `DEFAULT_HTML_TEMPLATE` (a basic built-in template) will be used.

The HTML template **must** include these markers for content injection:

- `<!-- SSR_META -->`: Where metadata (from `streamCallbacks.getShellContext().meta`) will be injected.
- `<!-- SSR_ROOT -->`: Where the main application content will be streamed.
- `<!-- SSR_STATE -->`: Where the dehydrated state script (from `streamCallbacks.getShellContext().state`) will be injected.

Example structure of `DEFAULT_HTML_TEMPLATE` or a custom template:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- SSR_META -->
  </head>
  <body>
    <div id="root"><!-- SSR_ROOT --></div>
    <script>
      window.__INITIAL_STATE__ = <!-- SSR_STATE -->;
    </script>
    <!-- Your client-side JS bundles might be linked here or loaded by your app -->
  </body>
</html>
```

## Vite Configuration

The server uses Vite internally with a pre-configured setup optimized for SSR. Direct customization of the Vite configuration via `createSsrServer` options is not currently supported. Vite's middleware mode is used to handle module loading and HMR during development.

## Advanced Customization

The power of `universal-renderer` lies in its callback system (`CoreRenderCallbacks`, `StreamSpecificCallbacks`, `StaticSpecificCallbacks`). By implementing these interfaces and defining your own `TSetupResult` extending `AppSetupResultBase`, you can integrate virtually any JavaScript library or framework for SSR. This allows you to manage complex state, custom styling solutions, or unique routing requirements while leveraging the robust server infrastructure provided.
