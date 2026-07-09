UniversalRenderer.configure do |c|
  # The HTTP adapter uses the external Bun SSR server configured in Procfile.dev.
  # It supports streaming via the /stream endpoint.
  c.adapter = :http

  c.url = "http://localhost:5200"
  c.timeout = 3
  c.stream_path = "/stream"
end
