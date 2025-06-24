module UniversalRenderer
  class Configuration
    attr_accessor :ssr_url,
                  :timeout,
                  :ssr_stream_path,
                  :engine,
                  :bun_pool_size,
                  :bun_timeout,
                  :bun_cli_script

    def initialize
      @ssr_url = ENV.fetch("SSR_SERVER_URL", nil)
      @timeout = (ENV["SSR_TIMEOUT"] || 3).to_i
      @ssr_stream_path = ENV.fetch("SSR_STREAM_PATH", "/stream")
      @engine = (ENV["SSR_ENGINE"] || :http).to_sym
      @bun_pool_size = ENV.fetch("SSR_BUN_POOL_SIZE", 5).to_i
      @bun_timeout = ENV.fetch("SSR_BUN_TIMEOUT", 5_000).to_i
      @bun_cli_script =
        ENV.fetch("SSR_BUN_CLI_SCRIPT", "app/frontend/ssr/ssr.ts")
    end
  end
end
