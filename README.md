# UniversalRenderer

[![Gem Version](https://img.shields.io/gem/v/universal_renderer)](https://rubygems.org/gems/universal_renderer) [![NPM Version](https://img.shields.io/npm/v/universal-renderer)](https://www.npmjs.com/package/universal-renderer)

A streamlined solution for integrating Server-Side Rendering (SSR) into Rails applications.

## Overview

UniversalRenderer helps you forward rendering requests to external SSR services, manage responses, and improve performance, SEO, and user experience for JavaScript-heavy frontends. It works seamlessly with the `universal-renderer` NPM package.

## Features

- **Static and streaming SSR** support
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
  config.ssr_url = "http://localhost:3001"
end
```

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

    # @ssr will now contain the SSR response, where the symbolized keys
    # are the same keys returned by the SSR server response.
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

<%# Now you can use the instance variable @ssr in your layout. %>
<%# We'll send it with keys :meta, :styles, :root, and :state below. %>
<%# We can use the provided sanitize_ssr helper to sanitize our content %>

<% content_for :meta do %>
  <%= sanitize_ssr @ssr[:meta] %>
<% end %>

<div id="root">
  <%= sanitize_ssr @ssr[:styles] %>
  <%= sanitize_ssr @ssr[:root] %>
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
   import { dehydrate, QueryClient, QueryClientProvider } from "react-query";
   import { StaticRouter } from "react-router";
   import { ServerStyleSheet } from "styled-components";

   import App from "@/App";
   import Metadata from "@/components/Metadata";

   export default function setup(url: string, props: any) {
     const pathname = new URL(url).pathname;

     const helmetContext: HelmetDataContext = {};
     const sheet = new ServerStyleSheet();
     const queryClient = new QueryClient();

     const { query_data } = props;
     query_data.forEach(({ key, data }) => queryClient.setQueryData(key, data));
     const state = dehydrate(queryClient);

     const jsx = sheet.collectStyles(
       <HelmetProvider context={helmetContext}>
         <Metadata url={url} />
         <QueryClientProvider client={queryClient}>
           <StaticRouter location={pathname}>
             <App />
           </StaticRouter>
         </QueryClientProvider>
       </HelmetProvider>,
     );

     return { jsx, helmetContext, sheet, state, queryClient };
   }
   ```

3. Update your `application.tsx` to hydrate the SSR state:

   ```tsx
   import { HelmetProvider } from "@dr.pogodin/react-helmet";
   import { createRoot, hydrateRoot } from "react-dom/client";
   import { Hydrate, QueryClient, QueryClientProvider } from "react-query";
   import { BrowserRouter } from "react-router";

   import App from "@/App";
   import Metadata from "@/components/Metadata";

   const queryClient = new QueryClient();
   const stateElement = document.getElementById("state")!;
   const state = JSON.parse(stateElement.textContent);

   const app = (
     <HelmetProvider>
       <Metadata url={window.location.href} />
       <QueryClientProvider client={queryClient}>
         <Hydrate state={state}>
           <BrowserRouter>
             <App />
           </BrowserRouter>
         </Hydrate>
       </QueryClientProvider>
     </HelmetProvider>
   );

   const rootElement = document.getElementById("root")!;
   hydrateRoot(rootElement, app);
   ```

4. Create an SSR entry point at `app/frontend/ssr/ssr.ts`:

   ```ts
   import { renderToString } from "react-dom/server.node";
   import { createSsrServer } from "universal-renderer";
   import setup from "@/ssr/setup";
   import {
     createRenderStreamTransformer,
     extractMeta,
     getRequestLogger,
     getStateElement,
   } from "@/ssr/utils";

   const app = await createSsrServer({
     callbacks: {
       setup,
       render: async ({ jsx, helmetContext, sheet, state }) => {
         const root = renderToString(jsx);
         const meta = extractMeta(helmetContext);
         const styles = sheet.getStyleTags();
         return { meta, root, styles, state };
       },
       cleanup: async ({ sheet, queryClient }) => {
         sheet?.seal();
         queryClient?.clear();
       },
     },
   });

   app.listen(3001, () => {
     console.log(`[SSR] server started on http://localhost:3001`);
   });
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

## Contributing

Contributions are welcome! Please follow the coding guidelines in the project documentation.

## License

Available as open source under the terms of the [MIT License](https://opensource.org/licenses/MIT).
