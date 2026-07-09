UniversalRenderer.configure do |c|
  # The external Bun SSR server is configured in Procfile.dev.
  # It supports streaming via the /stream endpoint.
  c.url = "http://localhost:5200"
  c.timeout = 3
  c.stream_path = "/stream"
end
