# universal-renderer

**Note:** This package is the Node.js/Express server component for the [`universal_renderer` Ruby gem](https://github.com/thaske/universal_renderer). The Ruby gem, when installed in a Rails application, forwards rendering requests to a server running this Node.js package.

`universal-renderer` helps you create a flexible Server-Side Rendering (SSR) server for your JavaScript applications using Express and Vite. It's designed to work with various frontend libraries through a callback system.

## Quick Start: Your First SSR Server

Let's get a basic server running. This example shows a minimal setup for static rendering.

```ts + jsx
// setup.tsx

function setup(url: string, props: any) {
  // Extract the pathname for client-side router compatibility.
  const { pathname } = new URL(url);

  // Prepare contexts for managing head tags (Helmet) and style sheets (styled-components).
  const helmetContext: HelmetDataContext = {};
  const sheet = new ServerStyleSheet();

  // Initialize React Query: populate with pre-fetched data and prepare for client-side hydration.
  const queryClient = new QueryClient();
  const { queryData } = props; // Data typically passed from the Rails side.
  queryData.forEach(({ key, data }) => queryClient.setQueryData(key, data));
  const state = dehydrate(queryClient); // Serialized state for the client.

  // Assemble the main application component with necessary providers.
  const jsx = sheet.collectStyles(
    <HelmetProvider context={helmetContext}>
      <QueryClientProvider client={queryClient}>
        <StaticRouter location={pathname}>
          <App />
        </StaticRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );

  // Return the renderable JSX and contexts/state for the SSR process.
  return { jsx, helmetContext, sheet, state, queryClient };
}

export default setup;
```

```typescript
// ssr.ts

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});

const app = await createSsrServer({
  vite,
  coreCallbacks: {
    // Dynamically load the `setup` function using Vite for SSR
    setup: (await vite.ssrLoadModule("./setup.tsx")).default,

    // `cleanup` is called after each request to free resources (e.g., seal style sheets, clear query cache).
    async cleanup({ sheet, queryClient }) {
      sheet?.seal();
      queryClient?.clear();
    },

    // `onError` handles errors during SSR, using Vite to improve stack traces.
    onError(error, context, errorContext) {
      vite.ssrFixStacktrace(error);
      console.error(error);
    },
  },
  staticCallbacks: {
    // `render` converts the prepared JSX into a static HTML string and extracts related assets.
    async render({ jsx, helmetContext, sheet, state }) {
      const root = renderToString(jsx); // React's standard SSR function.
      const meta = extractMeta(helmetContext); // Generates meta tags from Helmet context.
      const styles = sheet.getStyleTags(); // Retrieves CSS from styled-components.

      // This output is sent as JSON to the Ruby gem.
      return { meta, root, styles, state };
    },
  },
});

app.listen(4173, () => {
  console.log(`Server started on http://localhost:4173`);
});
```

```erb + html
<%# app/views/ssr/index.html.erb %>

<% content_for :meta do %>
  <%= @ssr[:meta] %>
<% end %>

<div id="root">
  <%= @ssr[:styles] + @ssr[:root] %>
</div>

<script id="state" type="application/json">
  <%= @ssr[:state].to_json %>
</script>
```

## How It Works: The Callback System

`universal-renderer` uses a system of callbacks to let you control how your application is set up, rendered, and cleaned up. You provide these callbacks when you create the server.

### Interaction with the `universal_renderer` Ruby Gem

This Node.js package is designed to work in conjunction with its [companion Ruby gem](https://github.com/thaske/universal_renderer) for Rails applications. The gem facilitates communication between your Rails app and this SSR server. Here's a brief overview of the interaction:

- **Static Rendering (`/static` endpoint):**

  - When your Rails application needs to render a component statically, the Ruby gem makes a POST request to the `/static` endpoint of this Node.js server.
  - The JSON response from this server (e.g., `{ "html": "...", "customData": "..." }`) is then typically assigned to an instance variable in your Rails controller (commonly `@ssr`).
  - In your Rails views, you can then access the values from this JSON response using the keys (e.g., `@ssr[:html]`, `@ssr[:customData]`).

This collaborative approach allows Rails to handle the initial part of the page structure and headers, while this Node.js server focuses on rendering the dynamic JavaScript application content.

### `createSsrServer(options)`

This is the main function. You pass it your Vite instance and your callback implementations.

Options:

- `vite`: Your Vite development server instance.
- `coreCallbacks`: Essential for all rendering. Handles setting up your app (e.g., with routers, state management) and cleaning up afterwards.
- `staticCallbacks`: For rendering your app to a static HTML string.

### Callbacks

1.  **`CoreRenderCallbacks<TContext>`**:

    - `setup(requestUrl, props)`: This is where you prepare your application to be rendered. You'll typically import your main app component, wrap it with any necessary providers (like routers, state managers), and return a `context` object.
    - `cleanup(context)`: Called after rendering to perform any cleanup tasks.
    - `onError(error, context)`: Optional. Handles any errors during rendering.

2.  **`StaticSpecificCallbacks<TContext, TRenderOutput>`**:

    - `render(context)`: Takes the `jsx` from your `context` and renders it to a static format. For React, this is where you'd use `renderToString()`. The shape of `TRenderOutput` is defined by you.

## Server Endpoints

The server created by `createSsrServer` exposes these POST endpoints (paths are relative to `basePath`, which defaults to `/`):

- `/static` (or `/`): For static SSR.
  - Request body: `{ "url": string, "props"?: Record<string, any> }`
  - Response: JSON object whose structure is determined by your `staticCallbacks.render` (e.g., `{ html: "...", meta: "..." }`). This JSON response is typically consumed by the accompanying Ruby gem, making its keys available in your Rails view context (often via an `@ssr` variable).

And a GET endpoint for health checks:

- `/health`: Returns `{ status: "OK", timestamp: "..." }`.

## Advanced Customization

The callback system is designed for flexibility. You can integrate various libraries for:

- Routing (e.g., React Router)
- State Management (e.g., Redux, Zustand, React Query)
- Styling (e.g., Styled Components, Emotion)
- Meta Tag Management (e.g., React Helmet Async)

Refer to the type definitions (`RenderContextBase`, `CoreRenderCallbacks`, `StaticSpecificCallbacks`) for full details on all available callback functions and their signatures to tailor the SSR process to your specific stack.
