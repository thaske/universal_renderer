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

## Requirements

> **Heads-up ⚠️** &nbsp;The JavaScript side of UniversalRenderer is **Bun-native**.
>
> • You **must** run the SSR server with **Bun ≥ 1.2**.
>
> • The exported helpers call Bun's built-in HTTP router and `Response` implementation; they **will not boot under Node, Deno, or Cloudflare Workers**.
>
> • The Ruby gem is runtime-agnostic and continues to work on every platform – only the SSR service requires Bun.

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

<%# Inject SSR snippets using the provided helpers. When streaming is enabled
     these render HTML placeholders (<!-- SSR_HEAD --> / <!-- SSR_BODY -->);
     otherwise they output the sanitised HTML returned by the SSR service. %>

<head>
  <%= ssr_head %>
</head>

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

     const jsx = sheet.collectStyles(
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

     return { jsx, helmetContext, sheet, queryClient };
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
   import { createServer as createViteServer } from "vite";

   const vite = await createViteServer({
     server: { middlewareMode: true },
     appType: "custom",
   });

   await createServer({
     port: 3001,
     middleware: vite.middlewares,

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
