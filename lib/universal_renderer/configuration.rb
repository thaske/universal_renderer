# frozen_string_literal: true

module UniversalRenderer
  # Configuration for UniversalRenderer.
  #
  # This object holds plain Ruby defaults only. It never reads environment
  # variables itself; binding configuration to ENV is the host application's
  # responsibility, done in the initializer (see the generated
  # config/initializers/universal_renderer.rb). The documented env-var
  # convention is the `UNIVERSAL_RENDERER_*` prefix.
  class Configuration
    # HTTP client options.
    class Http
      attr_accessor :pool_size

      def initialize
        @pool_size = 5
      end
    end

    attr_accessor :url, :timeout, :stream_path
    attr_reader :http

    def initialize
      @url = nil
      @timeout = 3
      @stream_path = "/stream"
      @http = Http.new
    end
  end
end
