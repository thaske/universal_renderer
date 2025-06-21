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

4. Install a server framework for the Node SSR server:
   ```bash
   $ npm install uWebSockets.js # uWebSockets.js server (requires Node runtime)
   ```
   These frameworks are peer dependencies of the `universal-renderer` package.

## Configuration

Configure in `config/initializers/universal_renderer.rb`:

```ruby
UniversalRenderer.configure do |config|
  # Choose your SSR engine:
  # :http      - External Node.js/Bun server (default, supports streaming)
  # :mini_racer - In-process V8 via MiniRacer (no streaming, no external server)
  config.engine = :http

  # HTTP Engine Configuration (when engine = :http)
  config.ssr_url = "http://localhost:3001"
  config.timeout = 3

  # MiniRacer configuration is handled via environment variables:
  # SSR_MINI_RACER_POOL_SIZE (default: 5)
  # SSR_MINI_RACER_TIMEOUT (default: 5000ms)
  # SSR_MINI_RACER_MAX_MEMORY (default: 256MB)
end
```

## SSR Engines

UniversalRenderer supports two different SSR engines:

### HTTP Engine (Default)

The HTTP engine forwards SSR requests to an external Node.js or Bun server. This is the default and recommended approach for most applications.

**Pros:**

- Supports streaming SSR
- Full JavaScript ecosystem access
- Easy to scale horizontally
- Battle-tested in production

**Cons:**

- Requires external server setup
- Network overhead for each request
- Additional infrastructure complexity

### MiniRacer Engine

The MiniRacer engine executes JavaScript directly within your Rails process using Google's V8 engine via the `mini_racer` gem.

**Pros:**

- No external server required
- Eliminates network overhead
- Simplified deployment
- Better for simple SSR needs

**Cons:**

- No streaming support
- Limited JavaScript ecosystem (no npm packages)
- Memory overhead per V8 context
- Not suitable for complex JavaScript applications

To use MiniRacer, set `config.engine = :mini_racer` and customize the JavaScript bundle at `app/assets/javascripts/universal_renderer/ssr_bundle.js` with your React components.

## Basic Usage

After installation, you can pass data to your SSR service using `add_prop` in your controllers:

```ruby
class ProductsController < ApplicationController
  enable_ssr # enables SSR controller-wide

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
   # or
   $ bun add universal-renderer
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

## Setting Up MiniRacer Engine

If you prefer to use the MiniRacer engine instead of an external server:

1. Configure the engine in your initializer:

   ```ruby
   # config/initializers/universal_renderer.rb
   UniversalRenderer.configure { |config| config.engine = :mini_racer }
   ```

2. Customize the SSR bundle at `app/assets/javascripts/universal_renderer/ssr_bundle.js`:

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

3. Bundle your React components into the SSR bundle file using your preferred bundler (Webpack, Vite, etc.)

4. Restart your Rails application - no external server needed!

**Note:** The MiniRacer engine requires that you bundle all your JavaScript dependencies into a single file, as it cannot access npm packages directly. The engine automatically includes the [fast-text-encoding](https://github.com/samthor/fast-text-encoding) polyfill for UTF-8 compatibility.

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

The project uses the [fast-text-encoding](https://github.com/samthor/fast-text-encoding) library as a Git submodule for UTF-8 text encoding support in the MiniRacer engine.

## Contributing

Contributions are welcome! Please follow the coding guidelines in the project documentation.

## License

Available as open source under the terms of the [MIT License](https://opensource.org/licenses/MIT).
