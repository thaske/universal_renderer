# UniversalRenderer

UniversalRenderer provides a streamlined way to integrate Server-Side Rendering (SSR) with an external SSR service into your Rails application. It helps you forward rendering requests, manage static or streaming responses, and improve performance, SEO, and user experience for JavaScript-heavy frontends.

## Features

- Supports both static and streaming SSR.
- Configurable SSR server endpoint and timeouts.
- Helper methods for passing data to your SSR service.
- Automatic fallback to client-side rendering if SSR fails.
- View helpers for integrating SSR content into your layouts.

## Installation

1.  Add this line to your application's Gemfile:

    ```ruby
    gem "universal_renderer"
    ```

2.  And then execute:

    ```bash
    $ bundle install
    ```

3.  Run the install generator to create an initializer and include the necessary concern in your `ApplicationController`:

    ```bash
    $ rails generate universal_renderer:install
    ```

    This will:

    - Create `config/initializers/universal_renderer.rb`.
    - Add `include UniversalRenderer::Rendering` to your `app/controllers/application_controller.rb`.

## Configuration

Configure UniversalRenderer in `config/initializers/universal_renderer.rb`:

```ruby
UniversalRenderer.configure do |config|
  # (Required) The base URL of your SSR server.
  # Example: 'http://localhost:3001' or 'https://your-ssr-service.com'
  # Can also be set via the SSR_SERVER_URL environment variable.
  config.ssr_url = ENV.fetch("SSR_SERVER_URL", "http://localhost:3001")

  # (Optional) Timeout in seconds for requests to the SSR server.
  # Defaults to 3 seconds.
  # Can also be set via the SSR_TIMEOUT environment variable.
  config.timeout = (ENV["SSR_TIMEOUT"] || 3).to_i

  # (Optional) The path on your SSR server for streaming requests.
  # Defaults to '/stream'.
  # Can also be set via the SSR_STREAM_PATH environment variable.
  config.ssr_stream_path = ENV.fetch("SSR_STREAM_PATH", "/stream")
end
```

**Environment Variables:**
The `ssr_url`, `timeout`, and `ssr_stream_path` can be configured directly via environment variables (`SSR_SERVER_URL`, `SSR_TIMEOUT`, `SSR_STREAM_PATH`). If set, environment variables will take precedence over values in the initializer.

## Usage

The `universal_renderer:install` generator includes the `UniversalRenderer::Rendering` concern into your `ApplicationController`. This concern overrides `default_render` to automatically handle SSR.

### Passing Data to SSR (`add_props`)

In your controllers, you can use the `add_props` method to pass data from your Rails application to the SSR service. This data will be available as a JSON object under the `props` key in the JSON payload sent to your SSR service.

For streaming requests, the content of `app/views/ssr/stream.html.erb` is automatically read and added to the `props` hash under the key `_railsLayoutHtml` before being sent to the SSR streaming service.

`add_props` can be called in two ways:

1.  **Key-Value Pair:**

    ```ruby
    # In your controller action
    def show
      @product = Product.find(params[:id])
      add_props(:product, @product.as_json) # Ensure data is serializable
      add_props(:current_user_name, current_user.name)
      # ... default_render will be called implicitly
    end
    ```

    This will result in the `props` object in the SSR request payload being like:
    `{ "product": { ...product_data... }, "current_user_name": "User Name" }`

2.  **Hash Argument:**

    ```ruby
    # In your controller action
    def index
      @posts = Post.recent
      add_props(posts: @posts.map(&:as_json), current_page: params[:page])
      # ... default_render will be called implicitly
    end
    ```

    This will result in the `props` object in the SSR request payload being like:
    `{ "posts": [ ...posts_data... ], "current_page": "1" }`

Make sure any data passed is serializable to JSON (e.g., call `.as_json` on ActiveRecord objects).

### Rendering Process

The `Rendering` concern automatically determines whether to use static or streaming SSR:

- **Streaming SSR:** Opt-in feature. If enabled, the gem makes a request to your SSR service's streaming endpoint (`config.ssr_stream_path`). The response is streamed directly to the client.
  - You can enable streaming SSR globally by setting the environment variable `ENABLE_SSR_STREAMING` to `1`, `true`, `yes`, or `y`.
- **Static SSR:** Used if streaming is not enabled or if it fails in a way that allows fallback before the stream starts. The gem makes a request to your SSR service's root path (`/`) of the `config.ssr_url`. The SSR service is expected to return a complete JSON object.

### Templates

The gem relies on a few conventional template paths:

- `app/views/ssr/index.html.erb`: Used when `StaticClient` successfully receives data from the SSR server. This template typically uses the data (available in `@ssr`) to render the page.
- `app/views/ssr/stream.html.erb`: The content of this file is automatically passed to your SSR streaming service within the `props` object under the key `_railsLayoutHtml`. The SSR service is expected to use this HTML string as the base layout and stream its content into it, or use the `SsrHelpers` placeholders within this layout.
- `app/views/application/index.html.erb`: This template is used as a fallback if SSR fails (e.g., SSR server is down, returns an error, or `StaticClient` receives no data). This usually contains your client-side rendering (CSR) entry point.

### View Helpers (`SsrHelpers`)

The `UniversalRenderer::SsrHelpers` module provides helpers to mark locations in your HTML structure. These are typically used within the `layout` sent to the streaming SSR service or within the HTML generated by your static SSR service.

- `ssr_meta`: Placeholder for meta tags or other head elements generated by SSR.
- `ssr_root`: Placeholder for the main root element where your SSR application will be rendered.
- `ssr_state`: Placeholder for embedding initial application state (e.g., as a JSON script tag) for client-side hydration.

**Example (`app/views/ssr/stream.html.erb` or part of SSR service's output):**

```html+erb
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
  <%= csrf_meta_tags %>
  <%= csp_meta_tag %>
  <%= stylesheet_link_tag "application", "data-turbo-track": "reload" %>
  <%= ssr_meta %> <%# SSR service might inject specific meta tags here %>
</head>
<body>
  <div id="root">
    <%= ssr_root %> <%# SSR service streams the main application content here %>
  </div>
  <%= ssr_state %> <%# SSR service might inject a script tag with initial state here %>
  <%= javascript_importmap_tags %>
</body>
</html>
```

## SSR Server Expectations

Your external SSR server needs to meet the following expectations:

1.  **Static Rendering Endpoint (for `StaticClient`):**

    - **Path:** `/` (root of the `config.ssr_url`).
    - **Method:** `POST`
    - **Request Body (JSON):**
      ```jsonc
      {
        "url": "current_rails_request_original_url",
        "props": {
          // JSON object built from add_props calls
          // e.g., "product": { ... }, "current_user_name": "..."
        },
      }
      ```
    - **Successful Response:** `200 OK` with a JSON body. The structure of this JSON is up to you, but it will be available in your `app/views/ssr/index.html.erb` template as `@ssr` (with keys symbolized). Example:
      ```jsonc
      {
        "html_content": "<div>Rendered Product</div>",
        "initial_state": { "product_id": 123 },
        "meta_tags": "<meta name='description' content='...'>",
      }
      ```

2.  **Streaming Rendering Endpoint (for `StreamClient`):**

    - **Path:** `config.ssr_stream_path` (defaults to `/stream`) on the `config.ssr_url`.
    - **Method:** `POST`
    - **Request Body (JSON):**
      ```jsonc
      {
        "url": "current_rails_request_original_url",
        "props": {
          // User-defined props from add_props calls...
          "_railsLayoutHtml": "<!-- content of app/views/ssr/stream.html.erb -->",
          // ... other props ...
        },
      }
      ```
    - **Successful Response:** `200 OK` with `Content-Type: text/html`. The body should be an HTML stream. The SSR service should handle injecting its rendered components into the provided layout string (found in `props._railsLayoutHtml`) or use the `SsrHelpers` placeholders within it.

## Example Controller

```ruby
# app/controllers/products_controller.rb
class ProductsController < ApplicationController
  def show
    @product = Product.find(params[:id])

    # Pass data to SSR service using add_props
    add_props(
      product: @product.as_json, # Ensure data is serializable
      related_products: @product.related_products.limit(5).as_json
    )

    # default_render (from UniversalRenderer::Rendering) will be called automatically,
    # handling either streaming or static SSR based on configuration and environment.
  end
end
```

## Contributing

TODO

## License

The gem is available as open source under the terms of the [MIT License](https://opensource.org/licenses/MIT).
