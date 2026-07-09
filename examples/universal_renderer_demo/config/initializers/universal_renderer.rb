UniversalRenderer.configure do |c|
  # The HTTP adapter uses the external Bun SSR server configured in Procfile.dev.
  # It supports streaming via the /stream endpoint.
  c.engine = :http

  # HTTP Engine Configuration (when engine = :http)
  c.ssr_url = ENV.fetch("SSR_SERVER_URL", "http://localhost:5200")
  c.timeout = 3
  c.ssr_stream_path = "/stream"
end
