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
    # HTTP adapter options. Applies only when `config.adapter == :http`.
    class Http
      attr_accessor :pool_size

      def initialize
        @pool_size = 5
      end
    end

    # Stdio adapter options. Applies only when `config.adapter == :stdio`.
    #
    # NOTE: The stdio adapter is experimental and less battle-tested than the
    # HTTP adapter. It is intended for embedded, single-process deployments and
    # is not recommended for production.
    class Stdio
      attr_accessor :pool_size, :timeout_ms, :cli_script

      def initialize
        @pool_size = 5
        @timeout_ms = 5_000
        @cli_script = "app/frontend/ssr/stdio.tsx"
      end
    end

    attr_accessor :url, :timeout, :stream_path
    attr_reader :adapter, :http, :stdio

    def initialize
      @adapter = :http
      @url = nil
      @timeout = 3
      @stream_path = "/stream"
      @http = Http.new
      @stdio = Stdio.new
    end

    def adapter=(value)
      @adapter = value.to_s.downcase.to_sym
    end
  end
end
