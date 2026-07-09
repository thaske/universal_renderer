# UniversalRenderer

[![CI](https://img.shields.io/github/actions/workflow/status/thaske/universal_renderer/ci.yml)](https://github.com/thaske/universal_renderer/actions/workflows/ci.yml)

[![Gem Version](https://img.shields.io/gem/v/universal_renderer)](https://rubygems.org/gems/universal_renderer) [![NPM Version](https://img.shields.io/npm/v/universal-renderer)](https://www.npmjs.com/package/universal-renderer)

A streamlined solution for integrating Server-Side Rendering (SSR) into Rails applications.

## Overview

UniversalRenderer helps you forward rendering requests to external SSR services, manage responses, and improve performance, SEO, and user experience for JavaScript-heavy frontends. It works seamlessly with the `universal-renderer` NPM package.

## Features

- **Streaming SSR** support
- **Configurable SSR server endpoint** and timeouts
- **Simple API** for passing data between Rails and your SSR service
- **Automatic fallback** to client-side rendering if SSR fails
- **View helpers** for easy integration into your layouts

## Installation

1. Add to your Gemfile:

   ```ruby
   gem "universal_renderer"
   ```

2. Install:

   ```bash
   $ bundle install
   ```

3. Run the generator:

   ```bash
   $ rails generate universal_renderer:install
   ```

## Configuration

Configure in `config/initializers/universal_renderer.rb`:

```ruby
UniversalRenderer.configure do |config|
  # Choose your SSR engine:
  # :http           - External Node.js server (default)
  # :stdio          - Stdio Bun processes via Open3 (no external server)
  # Both engines support blocking and streaming SSR.
  config.engine = :http
  # HTTP is recommended for most applications, including production.
  # Choose :stdio only when you want embedded SSR instead of a separate service.

  # HTTP Engine Configuration (when engine = :http)
  config.ssr_url = "http://localhost:3001"
  config.timeout = 3
  config.http_pool_size = 5 # persistent Net::HTTP connections per SSR origin

  # HTTP configuration can also use environment variables:
  # SSR_HTTP_POOL_SIZE (default: 5)

  # Stdio configuration is handled via environment variables:
  # SSR_STDIO_POOL_SIZE (default: 5)
  # SSR_STDIO_TIMEOUT (default: 5000ms)
  # SSR_STDIO_CLI_SCRIPT (default: "app/frontend/ssr/stdio.tsx")
end
```

## Logging

The gem logs through `UniversalRenderer.logger`, which defaults to the host
application's `Rails.logger` wrapped in `ActiveSupport::TaggedLogging`. Every
log line is automatically prefixed with `[UniversalRenderer]`, so you can
distinguish the gem's output in a shared log stream without remembering a
per-call prefix.

You can replace the logger with any object responding to the standard
`Logger` interface (useful for routing gem logs to a separate file, a
different formatter, or a semantic-logging backend):

```ruby
UniversalRenderer.logger = Logger.new("log/universal_renderer.log")
```

Setting it back to `nil` restores the default tagged `Rails.logger`.
```

## SSR Engines

UniversalRenderer supports two SSR engine modes:

### HTTP Engine (Default)

The HTTP engine forwards SSR requests to an external Node.js server. This is the default and recommended approach for most applications.

**Pros:**

- Supports streaming SSR
- Full JavaScript ecosystem access
- Easy to scale horizontally
- Battle-tested in production

**Cons:**

- Requires external server setup
- HTTP serialization overhead for each request, though persistent connections are reused
- Additional infrastructure complexity

### Stdio Engine

The Stdio engine maintains a pool of stdio Bun processes and communicates with them via stdin/stdout for server-side rendering.

**Pros:**

- No external server required
- Eliminates network overhead
- Simplified deployment
- Better for simple SSR needs
- Streaming SSR support (requires `streamCallbacks` in the stdio renderer)

**Cons:**

- Memory overhead per long-lived process
- Not suitable for complex JavaScript applications

### Selecting the engine per environment

HTTP is the safest default for most environments, including production, because it
keeps the SSR runtime separately observable, restartable, and scalable. Choose
`:stdio` when you explicitly want embedded SSR inside the Rails deployment and
are comfortable sizing and operating the Bun process pool with the Rails app.

If production uses `:stdio`, ensure Bun and the configured stdio script are available
before boot. The script can be a `.ts` / `.tsx` entrypoint or a prebuilt bundle.

## Basic Usage

After installation, you can pass data to your SSR service using `add_prop` in your controllers:

### SSR Modes

UniversalRenderer supports two SSR modes:

1. **Standard/blocking SSR** (default and recommended for most pages): Fetches complete HTML from the SSR service before rendering
2. **Streaming SSR**: Streams HTML content as it's generated (requires ActionController::Live)

```ruby
# Standard SSR (recommended for most use cases)
enable_ssr

# Streaming SSR (only use if you need fast TTFB)
enable_ssr streaming: true
```

```ruby
class ProductsController < ApplicationController
  # Enable basic SSR (recommended for most use cases)
  enable_ssr

  # Or enable SSR with streaming (only if you need real-time rendering)
  # enable_ssr streaming: true

  def show
    @product = Product.find(params[:id])

    # We can use the provided add_prop method to set a single value.
    add_prop(:product, @product.as_json)

    # We can use the provided push_prop method to push multiple values to an array.
    # This is useful for pushing data to React Query.
    push_prop(:query_data, { key: ["currentUser"], data: current_user.as_json })

    fetch_ssr # or fetch on demand

    # @ssr will now contain a UniversalRenderer::SSR::Response which exposes
    # `.head`, `.body` and optional `.body_attrs` values returned by the SSR
    # service.
  end

  def default_render
    # If you want to re-use the same layout across multiple actions.
    # You can also put this in your ApplicationController.
    render "ssr/index"
  end
end
```

```erb
<%# "ssr/index" %>

<%# Inject SSR snippets using the provided helpers %>
<%# When streaming is enabled these render HTML placeholders %>
<%# Otherwise they output the sanitised HTML returned by the SSR service %>

<%= content_for :head do %>
  <%= ssr_head %>
<% end %>

<div id="root">
  <%= ssr_body %>
</div>
```

## Setting Up the SSR Server

To set up the SSR server for your Rails application:

1. Install the NPM package in your JavaScript project:

   ```bash
   $ npm install universal-renderer
   # or
   $ yarn add universal-renderer
   ```

2. Create a `setup` function at `app/frontend/ssr/setup.ts`:

   ```tsx
   import {
     HelmetProvider,
     type HelmetDataContext,
   } from "@dr.pogodin/react-helmet";
   import { QueryClient, QueryClientProvider } from "react-query";
   import { StaticRouter } from "react-router";
   import { ServerStyleSheet } from "styled-components";

   import App from "@/App";
   import Metadata from "@/components/Metadata";

   export default function setup(url: string, props: any) {
     const pathname = new URL(url).pathname;

     const helmetContext: HelmetDataContext = {};
     const sheet = new ServerStyleSheet();
     const queryClient = new QueryClient();

     const { query_data = [] } = props;
     query_data.forEach(({ key, data }) => queryClient.setQueryData(key, data));
     const state = dehydrate(queryClient);

     const app = sheet.collectStyles(
       <HelmetProvider context={helmetContext}>
         <Metadata url={url} />
         <QueryClientProvider client={queryClient}>
           <StaticRouter location={pathname}>
             <App />
           </StaticRouter>
         </QueryClientProvider>
         <template id="state" data-state={JSON.stringify(state)} />
       </HelmetProvider>,
     );

     return { app, helmetContext, sheet, queryClient };
   }
   ```

3. Update your `application.tsx` to hydrate on the client:

   ```tsx
   import { HelmetProvider } from "@dr.pogodin/react-helmet";
   import { hydrateRoot } from "react-dom/client";
   import { BrowserRouter } from "react-router";
   import { Hydrate, QueryClient, QueryClientProvider } from "react-query";
   import App from "@/App";
   import Metadata from "@/components/Metadata";

   const queryClient = new QueryClient();

   const stateEl = document.getElementById("state");
   const state = JSON.parse(stateEl?.dataset.state ?? "{}");
   stateEl?.remove();

   hydrateRoot(
     document.getElementById("root")!,
     <HelmetProvider>
       <Metadata url={window.location.href} />
       <QueryClientProvider client={queryClient}>
         <Hydrate state={state}>
           <BrowserRouter>
             <App />
           </BrowserRouter>
         </Hydrate>
       </QueryClientProvider>
     </HelmetProvider>,
   );
   ```

4. Create an SSR entry point at `app/frontend/ssr/ssr.ts`:

   ```ts
   import { head, transform } from "@/ssr/utils";
   import { renderToString } from "react-dom/server.node";
   import { createServer } from "universal-renderer";

   const app = await createServer({
     setup: (await import("@/ssr/setup")).default,

     render: ({ app, helmet, sheet }) => {
       const root = renderToString(app);
       const styles = sheet.getStyleTags();
       return {
         head: head({ helmet }),
         body: `${root}\n${styles}`,
       };
     },

     cleanup: ({ sheet, queryClient }) => {
       sheet?.seal();
       queryClient?.clear();
     },
   });

   app.listen(3001);
   ```

5. Build the SSR bundle:

   ```bash
   $ bin/vite build --ssr
   ```

6. Start your servers:

   ```Procfile
   web: bin/rails s
   ssr: bin/vite ssr
   ```

## Setting Up Stdio Engine

If you prefer to use the stdio engine instead of an external HTTP server:

1. Configure the engine in your initializer:

   ```ruby
   # config/initializers/universal_renderer.rb
   UniversalRenderer.configure { |config| config.engine = :stdio }
   ```

2. Create a persistent CLI script (e.g., `app/frontend/ssr/stdio.tsx`):

   ```tsx
   import { renderToString } from "react-dom/server.node";
   import { createRenderer } from "universal-renderer/stdio";

   import setup from "@/ssr/setup";

   await createRenderer({
     setup,
     render: ({ app }) => ({
       body: renderToString(app),
     }),
   });
   ```

3. Customize the SSR bundle at `app/assets/javascripts/universal_renderer/ssr_bundle.js`:

   ```javascript
   // Import your bundled React components here
   // This file is created by the universal_renderer:install generator

   globalThis.UniversalSSR = {
     render: function (componentName, props, url) {
       try {
         // Map component names to actual components
         const components = {
           // Add your components here, e.g.:
           // App: YourAppComponent,
           // HomePage: YourHomePageComponent,
         };

         const Component = components[componentName];
         if (!Component) {
           throw new Error(`Unknown component: ${componentName}`);
         }

         // Use React.createElement and renderToString here
         const element = React.createElement(Component, { ...props, url });
         const body = renderToString(element);

         return {
           head: "<title>Your App</title>",
           body: body,
           bodyAttrs: {},
         };
       } catch (error) {
         return this.handleError(error, componentName, props, url);
       }
     },

     handleError: function (error, componentName, props, url) {
       console.error("SSR Error:", error);
       return {
         head: "<title>SSR Error</title>",
         body: `<div><h1>Server-Side Rendering Error</h1><p>Component: ${componentName}</p></div>`,
         bodyAttrs: {},
       };
     },
   };
   ```

4. Bundle your React components into the SSR bundle file using your preferred bundler (Webpack, Vite, etc.)

5. Restart your Rails application - no external server needed.

**Note:** The stdio engine requires a persistent CLI script that can handle JSON input/output and run under Bun. The persistent processes communicate via stdin/stdout, so your CLI script should read JSON from stdin and write JSON responses to stdout with `head`, `body`, and `body_attrs` fields (same format as the HTTP adapter).

## Development

To contribute to this project:

1. Clone the repository:

   ```bash
   git clone https://github.com/thaske/universal_renderer.git
   cd universal_renderer
   ```

2. Initialize and update submodules:

   ```bash
   git submodule update --init --recursive
   ```

3. Install dependencies:
   ```bash
   bundle install
   ```

The project previously used the [fast-text-encoding](https://github.com/samthor/fast-text-encoding) library as a Git submodule for UTF-8 text encoding support in the now-removed MiniRacer engine.

## Contributing

Contributions are welcome! Please follow the coding guidelines in the project documentation.

## License

Available as open source under the terms of the [MIT License](https://opensource.org/licenses/MIT).
