# frozen_string_literal: true

UniversalRenderer.configure do |c|
  # External Node.js/Bun SSR server. Supports streaming via the /stream endpoint.
  c.adapter = :http

  c.url = "http://localhost:3001"
  c.timeout = 3
  c.stream_path = "/stream"
  c.http.pool_size = 5

  # Blocking SSR is the default. Enable streaming per controller only when needed:
  # enable_ssr streaming: true
end
