# universal-renderer

**Note:** This package is the Node.js/Express server component for the [`universal_renderer` Ruby gem](https://github.com/thaske/universal_renderer). The Ruby gem, when installed in a Rails application, forwards rendering requests to a server running this Node.js package.

`universal-renderer` helps you create a flexible Server-Side Rendering (SSR) server for your JavaScript applications using Express and Vite. It's designed to work with various frontend libraries through a callback system.

## Quick Start: Your First SSR Server

Let's get a basic server running. This example shows a minimal setup for static rendering.

```typescript
// server.ts
import express from "express";
import http from "node:http";
import { createServer as createViteServer } from "vite";
import {
  createSsrServer,
  type RenderContextBase,
  type CoreRenderCallbacks,
  type StaticSpecificCallbacks,
} from "universal-renderer";

// 1. Define your application's rendering context
interface AppContext extends RenderContextBase {
  // You can add any custom data your app needs during rendering
  pageTitle: string;
}

// 2. Implement Core Callbacks
const coreCallbacks: CoreRenderCallbacks<AppContext> = {
  async setup(requestUrl: string, props: Record<string, any>) {
    // Here, you'd typically import your main App component
    // For simplicity, we'll use a placeholder
    const App = ({ title }: { title: string }) =>
      `<html><body><h1>${title}</h1></body></html>`;

    // This `jsx` is what will be rendered.
    // In a React app, this would be <App {...props} />
    // For this example, we are directly returning a string for simplicity.
    // However, the `RenderContextBase` expects `jsx` to be `React.ReactElement` or equivalent.
    // A real setup would involve React.createElement or JSX.
    const jsxPlaceholder = App({ title: `Page for ${requestUrl}` });

    return {
      jsx: jsxPlaceholder as any, // Cast for this simplified example
      pageTitle: `Page for ${requestUrl}`,
    };
  },
  cleanup(context) {
    console.log(`Cleaned up: ${context.pageTitle}`);
  },
};

// 3. Implement Static Rendering Callbacks
interface AppRenderOutput {
  html: string;
}

const staticCallbacks: StaticSpecificCallbacks<AppContext, AppRenderOutput> = {
  async render(context): Promise<AppRenderOutput> {
    // In a React app, you'd use renderToString(context.jsx)
    // Here we directly use the simplified string from setup
    return { html: context.jsx as unknown as string };
  },
};

// 4. Start the Server
async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  });

  const app = await createSsrServer<AppContext>({
    vite,
    coreCallbacks,
    staticCallbacks, // We're only doing static rendering for this example
  });

  const port = process.env.PORT || 3000;
  http.createServer(app).listen(port, () => {
    console.log(`SSR server started on http://localhost:${port}`);
    console.log(
      'Try: POST http://localhost:3000/static with JSON body {"url": "/test"}',
    );
  });
}

startServer();
```

**To run this example:**

1.  Save the code as `server.ts`.
2.  Install dependencies: `npm install express vite universal-renderer` (or `yarn add ...`).
3.  You'll need a `tsconfig.json` if you don't have one. A basic one:
    ```json
    {
      "compilerOptions": {
        "module": "ESNext",
        "moduleResolution": "node",
        "target": "ESNext",
        "esModuleInterop": true,
        "strict": true,
        "skipLibCheck": true
      }
    }
    ```
4.  Run the server: `npx ts-node-dev server.ts` (you might need to install `ts-node-dev` and `typescript`).
5.  Send a POST request to `http://localhost:3000/static` with JSON body: `{"url": "/hello"}`.
    You can use a tool like `curl`:
    ```bash
    curl -X POST -H "Content-Type: application/json" -d '{"url":"/world"}' http://localhost:3000/static
    ```
    The server will respond with `{"html":"<html><body><h1>Page for /world</h1></body></html>"}`.

## How It Works: The Callback System

`universal-renderer` uses a system of callbacks to let you control how your application is set up, rendered, and cleaned up. You provide these callbacks when you create the server.

### `createSsrServer(options)`

This is the main function. You pass it your Vite instance and your callback implementations.

Key options:

- `vite`: Your Vite development server instance.
- `coreCallbacks`: Essential for all rendering. Handles setting up your app (e.g., with routers, state management) and cleaning up afterwards.
- `staticCallbacks`: For rendering your app to a static HTML string.
- `streamCallbacks`: For streaming your app's content (useful for larger apps and faster time-to-first-byte).
- **Note:** You need to provide at least `staticCallbacks` or `streamCallbacks`.

### Main Callback Groups

1.  **`CoreRenderCallbacks<TContext>`**:

    - `setup(requestUrl, props)`: This is where you prepare your application to be rendered. You'll typically import your main app component, wrap it with any necessary providers (like routers, state managers), and return a `context` object.
      - This `context` object (which you define by extending `RenderContextBase`) must include a `jsx` property holding your main application component (e.g., `<App />`).
    - `cleanup(context)`: Called after rendering to perform any cleanup tasks.
    - `onError(error, context)`: Optional. Handles any errors during rendering.

2.  **`StaticSpecificCallbacks<TContext, TRenderOutput>`**:

    - `render(context)`: Takes the `jsx` from your `context` and renders it to a static format. For React, this is where you'd use `renderToString()`. The shape of `TRenderOutput` is defined by you.

3.  **`StreamSpecificCallbacks<TContext>`**: (For Streaming SSR)
    - These callbacks manage the streaming process. For React, this typically involves `renderToPipeableStream`. Key callbacks include:
      - `getReactNode(context)`: Provides the React node to stream (usually `context.jsx`).
      - `onWriteMeta(res, context)`: Allows you to write `<meta>` tags or other head elements early in the stream.
      - `createRenderStreamTransformer(context)`: Optional. To pipe the render stream through transformations (e.g., for styled-components).

## Example: React SSR (Static and Stream)

This example demonstrates a more complete setup using React, covering both static and streaming rendering.

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
// For stream, the default streamHandler uses renderToPipeableStream internally
// but you'd still provide the React element via context.jsx.
import type { ViteDevServer } from "vite";
import type { Response } from "express"; // For callback signatures
import type { Transform } from "node:stream"; // For createRenderStreamTransformer
import http from "node:http"; // For example server
import { createServer as createViteServer } from "vite"; // For example

// --- Dummy React for example to run ---
// In a real app, import React: import React from 'react';
const React = {
  createElement: (
    type: any,
    props: any,
    ...children: any[]
  ): { type: string; props: any; children: any[] } => ({
    type,
    props: props || {},
    children: children.flat(),
  }),
  Fragment: "Fragment", // Simple representation for Fragment
};
// --- End Dummy React ---

// Define the structure for your custom context
interface MyCustomContext extends RenderContextBase {
  // jsx is already in RenderContextBase
  appName: string;
  initialData?: Record<string, any>;
}

// Define the structure for your static render output
interface MyStaticRenderOutput {
  meta: string;
  body: string;
  initialDataScript?: string;
}

// Your main application component (example)
const App = ({ name, initialData }: { name: string; initialData?: any }) => {
  return React.createElement(
    "div",
    null,
    React.createElement("h1", null, `Hello from ${name}!`),
    React.createElement("p", null, `URL: ${initialData?.url}`),
    React.createElement("div", { id: "root" }, "App content goes here"), // Make sure your client-side hydration matches
  );
};

const myCoreCallbacks: CoreRenderCallbacks<MyCustomContext> = {
  async setup(requestUrl: string, props: Record<string, any>) {
    // In a real app, you'd wrap App with:
    // - Routers (e.g., <StaticRouter location={requestUrl}>)
    // - Context Providers (State, Helmet for meta, Style Collectors for CSS-in-JS)
    const appName = "My Universal React App";
    const initialData = { url: requestUrl, fromServer: true, ...props };

    // The main JSX for your application
    const jsx = React.createElement(App, { name: appName, initialData });

    return {
      jsx, // This is React.ReactElement
      appName,
      initialData,
    };
  },
  cleanup(context) {
    console.log(`Cleanup for ${context.appName}`);
    // e.g., seal style sheets for styled-components, clear React Query caches
  },
  onError(error, context, errorContext) {
    console.error(
      `Error during ${errorContext} for ${context?.appName}:`,
      error,
    );
  },
};

const myStreamCallbacks: StreamSpecificCallbacks<MyCustomContext> = {
  getReactNode(context) {
    // Typically, context.jsx is already your fully prepared React element
    return context.jsx;
  },
  async onResponseStart(res, context) {
    console.log(
      `Stream starting for ${context.appName} to URL ${context.initialData?.url}`,
    );
    // You could set custom headers here, e.g., res.setHeader("X-Render-Mode", "Stream");
  },
  async onWriteMeta(res, context) {
    // Write meta tags. In a real app, you'd use something like React Helmet Async
    // and extract tags from your context if you prepared them in `setup`.
    res.write(`<title>${context.appName} - Stream</title>`);
    res.write(
      `<meta name="description" content="Streamed with ${context.appName} for ${context.initialData?.url}">`,
    );
  },
  // createRenderStreamTransformer can be used for things like styled-components:
  // createRenderStreamTransformer(context) {
  //   if (context.styledComponentsSheet) { // Assuming sheet was created in setup
  //     return context.styledComponentsSheet.interleaveWithNodeStream();
  //   }
  //   return undefined;
  // },
  async onBeforeWriteClosingHtml(res, context) {
    // Useful for injecting data needed by the client before the HTML fully closes
    if (context.initialData) {
      res.write(
        `<script>window.__INITIAL_DATA__ = ${JSON.stringify(context.initialData)}</script>`,
      );
    }
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
    // Use React's renderToString for static output
    const body = renderToString(context.jsx as React.ReactElement); // Cast because dummy React is simplified
    const meta = `<title>${context.appName} - Static</title><meta name="description" content="Static render of ${context.appName} for ${context.initialData?.url}">`;

    let initialDataScript = "";
    if (context.initialData) {
      initialDataScript = `<script>window.__INITIAL_DATA__ = ${JSON.stringify(context.initialData)}</script>`;
    }

    return {
      meta,
      body, // This would be the main app HTML string
      initialDataScript,
    };
  },
};

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom", // Important for SSR with Vite
  });

  const app = await createSsrServer<MyCustomContext>({
    vite,
    coreCallbacks: myCoreCallbacks,
    streamCallbacks: myStreamCallbacks, // Enable streaming
    staticCallbacks: myStaticCallbacks, // Enable static rendering
    basePath: "/app", // Optional: if your app is not at the root
    configureExpressApp: (expressApp, viteDevServer) => {
      // Add any custom Express middleware or routes *before* SSR handlers
      expressApp.use("/my-custom-ping", (req, res) =>
        res.send("pong from custom Express route!"),
      );

      // You can also serve static assets with Vite's middleware
      // expressApp.use(viteDevServer.middlewares); // Already handled by default if not customizing too much
    },
  });

  const port = process.env.PORT || 3000;
  http.createServer(app).listen(port, () => {
    console.log(
      `SSR server with React example started on http://localhost:${port}`,
    );
    console.log(`Static endpoint: POST http://localhost:${port}/app/static`);
    console.log(`Stream endpoint: POST http://localhost:${port}/app/stream`);
    console.log(`Health check: GET http://localhost:${port}/app/health`);
    console.log(
      'Try: curl -X POST -H "Content-Type: application/json" -d \'{"url":"/test", "props": {"message":"hello from props"}}\' http://localhost:3000/app/static',
    );
    console.log(
      'And: curl -X POST -H "Content-Type: application/json" -d \'{"url":"/test-stream", "props": {"message":"streaming props"}, "template": "<html><head><!-- SSR_META --></head><body><!-- SSR_BODY --></body></html>"}\' http://localhost:3000/app/stream',
    );
  });
}

startServer();
```

## Server Endpoints

The server created by `createSsrServer` exposes these POST endpoints (paths are relative to `basePath`, which defaults to `/`):

- `/static` (or `/`): For static SSR.
  - Request body: `{ "url": string, "props"?: Record<string, any> }`
  - Response: JSON object whose structure is determined by your `staticCallbacks.render` (e.g., `{ html: "...", meta: "..." }`).
- `/stream`: For streaming SSR.
  - Request body: `{ "url": string, "props"?: Record<string, any>, "template": string }`
  - Response: HTML stream.

And a GET endpoint for health checks:

- `/health`: Returns `{ status: "OK", timestamp: "..." }`.

## HTML Template for Streaming

When using the `/stream` endpoint, your backend (e.g., Rails) must provide an HTML template string in the `template` field of the request body.

The template needs markers for content injection:

- `<!-- SSR_BODY -->`: **Mandatory.** This is where your main app content will be streamed.
- `<!-- SSR_META -->`: **Recommended.** Used by `streamCallbacks.onWriteMeta` to inject meta tags, title, etc., into the `<head>`.

**Example Template:**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- SSR_META -->
    <!-- Link your CSS, etc. here or via onWriteMeta -->
  </head>
  <body>
    <div id="app-container">
      <!-- Or your preferred root element structure -->
      <!-- SSR_BODY -->
    </div>
    <!-- Link your client-side JS bundle here, possibly after SSR_BODY -->
    <!-- Example: <script type="module" src="/src/entry-client.tsx"></script> -->
  </body>
</html>
```

The server uses these markers to insert the generated content appropriately.

## Advanced Customization

The callback system is designed for flexibility. You can integrate various libraries for:

- Routing (e.g., React Router)
- State Management (e.g., Redux, Zustand, React Query)
- Styling (e.g., Styled Components, Emotion)
- Meta Tag Management (e.g., React Helmet Async)

Refer to the type definitions (`RenderContextBase`, `CoreRenderCallbacks`, `StaticSpecificCallbacks`, `StreamSpecificCallbacks`) for full details on all available callback functions and their signatures to tailor the SSR process to your specific stack.

## Original Features (For Reference)

This section is a carry-over from the original README for more detailed feature listing if needed.

- **Framework Agnostic Core**: The core is designed to support any SSR setup through a flexible callback system.
- **Vite-Powered**: Leverages Vite for fast HMR during development and efficient module loading.
- **Static & Streaming SSR**: Supports static rendering and streaming SSR. **Note:** The current streaming implementation uses React's `renderToPipeableStream` and is therefore specific to React.
- **Customizable Rendering Lifecycle**: Use `RenderCallbacks` to integrate your specific libraries for routing, state management, styling, and metadata.
- **Type-Safe Customization**: Generic types for `SetupResultBase` and `RenderCallbacks` ensure type safety even with complex custom setups.
- **Default React Setup**: Includes pre-configured callbacks for common React ecosystems (React Router, React Helmet Async, React Query, Styled Components).
  - _(Note: The examples above show manual setup; a full "default React setup" package/module is not part of this core library but can be built using these primitives)._
