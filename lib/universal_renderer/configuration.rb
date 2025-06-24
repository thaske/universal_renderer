module UniversalRenderer
  class Configuration
    attr_accessor :ssr_url, :timeout, :ssr_stream_path, :engine, :bundle_path

    def initialize
      @ssr_url = ENV.fetch("SSR_SERVER_URL", nil)
      @timeout = (ENV["SSR_TIMEOUT"] || 3).to_i
      @ssr_stream_path = ENV.fetch("SSR_STREAM_PATH", "/stream")
      @engine = (ENV["SSR_ENGINE"] || :http).to_sym
    end
  end
end
