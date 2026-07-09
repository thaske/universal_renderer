module UniversalRenderer
  class Configuration
    attr_accessor :ssr_url,
                  :timeout,
                  :ssr_stream_path,
                  :stdio_pool_size,
                  :stdio_timeout,
                  :stdio_cli_script
    attr_reader :engine

    def initialize
      @ssr_url = ENV.fetch("SSR_SERVER_URL", nil)
      @timeout = (ENV["SSR_TIMEOUT"] || 3).to_i
      @ssr_stream_path = ENV.fetch("SSR_STREAM_PATH", "/stream")
      self.engine = ENV.fetch("SSR_ENGINE", :http)
      @stdio_pool_size = ENV.fetch("SSR_STDIO_POOL_SIZE", 5).to_i
      @stdio_timeout = ENV.fetch("SSR_STDIO_TIMEOUT", 5_000).to_i
      @stdio_cli_script =
        ENV.fetch("SSR_STDIO_CLI_SCRIPT", "app/frontend/ssr/stdio.tsx")
    end

    def engine=(value)
      @engine = value.to_s.downcase.to_sym
    end
  end
end
