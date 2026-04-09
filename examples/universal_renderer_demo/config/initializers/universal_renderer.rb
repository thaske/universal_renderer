UniversalRenderer.configure do |c|
  # Use HTTP SSR server in development/test, and Bun stdio in production.
  #  : :http
  c.engine = :stdio

  # HTTP Engine Configuration (when engine = :http)
  # In development/test, Procfile.dev starts the Express SSR server
  # SSR server from app/frontend/ssr/ssr.tsx.
  c.ssr_url = ENV.fetch("SSR_SERVER_URL", "http://localhost:5200")
  c.timeout = 3
  c.ssr_stream_path = "/stream"

  # Stdio Engine Configuration (when engine = :stdio)
  # These can also be set via environment variables:
  # SSR_STDIO_POOL_SIZE, SSR_STDIO_TIMEOUT, SSR_STDIO_CLI_SCRIPT
  c.stdio_pool_size = 5
  c.stdio_timeout = 5_000
  c.stdio_cli_script = "public/vite-ssr-stdio/ssr.js"

  # NOTE: When using Stdio, ensure you have a Bun-executable stdio CLI script that can handle
  # JSON input/output with head/body/body_attrs response format.
end
