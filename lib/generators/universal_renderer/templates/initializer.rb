UniversalRenderer.configure do |c|
  # Choose your SSR engine:
  # :http      - External Node.js/Bun server (default, supports streaming)
  # :mini_racer - In-process V8 via MiniRacer (no streaming, but no external server needed)
  c.engine = :http

  # HTTP Engine Configuration (when engine = :http)
  c.ssr_url = ENV.fetch("SSR_SERVER_URL", "http://localhost:3001")
  c.timeout = 3

  # MiniRacer Engine Configuration (when engine = :mini_racer)
  # These can also be set via environment variables:
  # SSR_MINI_RACER_POOL_SIZE, SSR_MINI_RACER_TIMEOUT, SSR_MINI_RACER_MAX_MEMORY, SSR_BUNDLE_PATH
  #
  # Bundle path: Path to your SSR JavaScript bundle (default: "app/assets/javascripts/universal_renderer/ssr_bundle.js")
  # c.bundle_path = "app/assets/javascripts/universal_renderer/ssr_bundle.js"
  #
  # Pool size: Number of V8 contexts (default: 5)
  # Timeout: JavaScript execution timeout in milliseconds (default: 5000)
  # Max memory: Memory limit per context in bytes (default: 256MB)
  #
  # Note: When using MiniRacer, customize your bundle file to include your React components and rendering logic.
end
