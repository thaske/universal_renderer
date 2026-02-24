module UniversalRenderer
  class Configuration
    attr_accessor :ssr_url,
                  :timeout,
                  :ssr_stream_path,
                  :bun_pool_size,
                  :bun_timeout,
                  :bun_cli_script
    attr_reader :engine, :engine_by_env

    def initialize
      @ssr_url = ENV.fetch("SSR_SERVER_URL", nil)
      @timeout = (ENV["SSR_TIMEOUT"] || 3).to_i
      @ssr_stream_path = ENV.fetch("SSR_STREAM_PATH", "/stream")
      self.engine = ENV.fetch("SSR_ENGINE", :http)
      self.engine_by_env = default_engine_by_env
      @bun_pool_size = ENV.fetch("SSR_BUN_POOL_SIZE", 5).to_i
      @bun_timeout = ENV.fetch("SSR_BUN_TIMEOUT", 5_000).to_i
      @bun_cli_script =
        ENV.fetch("SSR_BUN_CLI_SCRIPT", "app/frontend/ssr/ssr.ts")
    end

    def engine=(value)
      @engine = normalize_engine(value)
    end

    def engine_by_env=(value)
      @engine_by_env = normalize_engine_by_env(value)
    end

    private

    def default_engine_by_env
      {
        development: :http,
        test: :http,
        production: :bun_io
      }
    end

    def normalize_engine_by_env(value)
      return default_engine_by_env if value.nil?

      value.to_h.each_with_object({}) do |(environment, engine), normalized|
        normalized[environment.to_s.downcase] = normalize_engine(engine)
      end
    end

    def normalize_engine(value)
      value.to_s.downcase.to_sym
    end
  end
end
