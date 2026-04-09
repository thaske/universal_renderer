UniversalRenderer.configure do |c|
  # Choose your SSR engine:
  # :http           - External Node.js server (default, supports streaming)
  # :stdio          - Stdio Bun processes via Open3 (no streaming, but no external server needed)
  # :auto           - Resolve engine by Rails environment (dev/test: :http, production: :stdio)
  c.engine = :http
  # Example:
  # c.engine = :auto
  # c.engine_by_env = { development: :http, test: :http, production: :stdio }

  # HTTP Engine Configuration (when engine = :http)
  c.ssr_url = ENV.fetch("SSR_SERVER_URL", "http://localhost:3001")
  c.timeout = 3
  c.ssr_stream_path = "/stream"

  # Stdio Engine Configuration (when engine = :stdio)
  # These can also be set via environment variables:
  # SSR_STDIO_POOL_SIZE, SSR_STDIO_TIMEOUT, SSR_STDIO_CLI_SCRIPT
  c.stdio_pool_size = 5
  c.stdio_timeout = 5_000
  c.stdio_cli_script = "app/frontend/ssr/ssr.tsx"

  # NOTE: When using Stdio, ensure you have a Bun-executable stdio CLI script that can handle
  # JSON input/output with head/body/body_attrs response format.
end
