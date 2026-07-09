UniversalRenderer.configure do |c|
  # Choose your SSR engine:
  # :http           - External Node.js server (default, supports streaming)
  # :stdio          - Stdio Bun processes via Open3 (no streaming, but no external server needed)
  c.engine = :http
  # To select per environment:
  # c.engine = Rails.env.production? ? :stdio : :http

  # HTTP Engine Configuration (when engine = :http)
  c.ssr_url = ENV.fetch("SSR_SERVER_URL", "http://localhost:3001")
  c.timeout = 3
  c.ssr_stream_path = "/stream"

  # Stdio Engine Configuration (when engine = :stdio)
  # These can also be set via environment variables:
  # SSR_STDIO_POOL_SIZE, SSR_STDIO_TIMEOUT, SSR_STDIO_CLI_SCRIPT
  c.stdio_pool_size = 5
  c.stdio_timeout = 5_000
  c.stdio_cli_script = "app/frontend/ssr/stdio.tsx"

  # NOTE: When using Stdio, ensure you have a Bun-executable stdio CLI script that can handle
  # JSON input/output with head/body/body_attrs response format.
end
