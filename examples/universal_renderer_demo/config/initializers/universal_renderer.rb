UniversalRenderer.configure do |c|
  # :http  - external SSR server (Procfile.dev runs it from app/frontend/ssr/ssr.tsx)
  # :stdio - pool of Bun child processes speaking JSON over stdin/stdout
  # Override with SSR_ENGINE=http|stdio.
  c.engine = ENV.fetch("SSR_ENGINE") { Rails.env.production? ? :stdio : :http }

  # HTTP Engine Configuration (when engine = :http)
  c.ssr_url = ENV.fetch("SSR_SERVER_URL", "http://localhost:5200")
  c.timeout = 3
  c.ssr_stream_path = "/stream"

  # Stdio Engine Configuration (when engine = :stdio)
  # These can also be set via environment variables:
  # SSR_STDIO_POOL_SIZE, SSR_STDIO_TIMEOUT, SSR_STDIO_CLI_SCRIPT
  # The bundle is produced by bin/build-ssr-stdio from app/frontend/ssr/stdio.tsx.
  c.stdio_pool_size = 5
  c.stdio_timeout = 5_000
  c.stdio_cli_script = "public/vite-ssr-stdio/ssr.js"
end
