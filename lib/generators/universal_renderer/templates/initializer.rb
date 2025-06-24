UniversalRenderer.configure do |c|
  # Choose your SSR engine:
  # :http           - External Node.js/Bun server (default, supports streaming)
  # :bun_io         - Stdio Bun processes via Open3 (no streaming, but no external server needed)
  c.engine = :http

  # HTTP Engine Configuration (when engine = :http)
  c.ssr_url = ENV.fetch("SSR_SERVER_URL", "http://localhost:3001")
  c.timeout = 3
  c.ssr_stream_path = "/stream"

  # BunIo Engine Configuration (when engine = :bun_io)
  # These can also be set via environment variables:
  # SSR_BUN_POOL_SIZE, SSR_BUN_TIMEOUT, SSR_BUN_CLI_SCRIPT
  c.bun_pool_size = 5
  c.bun_timeout = 5_000
  c.bun_cli_script = "app/frontend/ssr/ssr.ts"

  # Note: When using BunIo, ensure you have a stdio CLI script that can handle JSON input/output with head/body/body_attrs response format.
end
