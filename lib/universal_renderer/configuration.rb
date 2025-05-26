module UniversalRenderer
  class Configuration
    attr_accessor :ssr_url, :timeout, :ssr_stream_path, :use_websockets

    def initialize
      @ssr_url = ENV.fetch("SSR_SERVER_URL", nil)
      @timeout = (ENV["SSR_TIMEOUT"] || 3).to_i
      @ssr_stream_path = ENV.fetch("SSR_STREAM_PATH", "/stream")
      @use_websockets =
        ENV.fetch("SSR_USE_WEBSOCKETS", "false").downcase == "true"
    end
  end
end
