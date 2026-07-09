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
UniversalRenderer.configure do |c|
  c.url = "http://localhost:3001"
  c.timeout = 3
  c.stream_path = "/stream"
  c.http.pool_size = 5 # persistent Net::HTTP connections per SSR origin

  # Blocking SSR is the default. Enable streaming per controller only when needed:
  # enable_ssr streaming: true
end
```

The gem itself never reads environment variables; it only exposes the plain
configuration attributes above with sensible defaults. Binding those values to
`ENV` is entirely up to you, in your own initializer, using whatever keys you
like. If you want a convention, the suggested env-var prefix is
`UNIVERSAL_RENDERER_*` (e.g. `UNIVERSAL_RENDERER_URL`):

```ruby
UniversalRenderer.configure do |c|
  c.url = ENV.fetch("UNIVERSAL_RENDERER_URL", "http://localhost:3001")
  c.timeout = ENV.fetch("UNIVERSAL_RENDERER_TIMEOUT", 3).to_i
  # ...
end
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

## Contributing

Contributions are welcome! Please follow the coding guidelines in the project documentation.

## License

Available as open source under the terms of the [MIT License](https://opensource.org/licenses/MIT).
