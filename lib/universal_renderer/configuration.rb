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

    # Origin of the SSR service, e.g. "http://localhost:3001".
    attr_accessor :url

    # Open and read timeout, in seconds, for every request to the SSR service.
    attr_accessor :timeout

    # Path the blocking renderer is mounted at on the SSR service. Must match
    # the `paths.render` option given to `createServer` in the NPM package,
    # whose default mounts `/` and `/static`.
    #
    # Defaults to nil, meaning "whatever path is already in `url`" — so setting
    # `url` to `http://host/render` keeps working without also setting this.
    # A relative value is treated as absolute (a leading slash is added), since
    # joining it relatively would replace the last path segment of `url`.
    attr_accessor :render_path

    # Path the streaming renderer is mounted at on the SSR service. Must match
    # the `paths.stream` option given to `createServer` in the NPM package.
    # Normalized the same way as `render_path`.
    attr_accessor :stream_path

    # Whether `ssr_head`/`ssr_body` run the renderer's HTML through Loofah
    # before embedding it.
    #
    # This is defense in depth over HTML your own renderer produced, not a
    # boundary against attacker-controlled markup. {SSR::Scrubber} is a
    # blocklist, and a blocklist cannot survive a parser mismatch between Loofah
    # and the browser. Escape untrusted data inside the render — React already
    # does, unless you reach for `dangerouslySetInnerHTML`.
    #
    # Sanitizing a full page render is also not free: it parses and rewrites the
    # entire document on the Rails side of every request, which eats into the
    # latency SSR is meant to buy. Defaults to on, because the cost is bounded
    # and the mistake it catches is not.
    attr_accessor :sanitize

    # Scrubber instance used when `sanitize` is true. Defaults to
    # {UniversalRenderer::SSR::Scrubber}; assign your own Loofah::Scrubber to
    # widen or narrow what survives.
    attr_accessor :scrubber

    # Whether the Rails engine includes {UniversalRenderer::Renderable} into
    # every ActionController::Base descendant.
    #
    # The concern adds three class attributes, a handful of public instance
    # methods, and a `render` override to whatever it is included in. That is a
    # lot of surface to add application-wide for something a handful of
    # controllers use, so apps can
    # turn the automatic include off and `include UniversalRenderer::Renderable`
    # in just the controllers that render server-side.
    #
    # Read when ActionController::Base loads, which is after initializers run.
    attr_accessor :auto_include

    # Optional callable invoked as `call(error, context)` whenever a configured
    # render request fails, where `context` is a hash carrying at least `:url`
    # and `:outcome`. A missing `url` is reported as `:not_configured` through
    # ActiveSupport::Notifications but does not call this hook. Errors are
    # always logged; this exists so failures can also reach an exception tracker.
    #
    # Every failure mode is a silent fall back to client-side rendering, so
    # without either this hook or the `render.universal_renderer` notification
    # an app has no way to notice that SSR stopped working.
    attr_accessor :on_error

    attr_reader :http

    def initialize
      @url = nil
      @timeout = 3
      @render_path = nil
      @stream_path = "/stream"
      @sanitize = true
      @scrubber = nil
      @auto_include = true
      @on_error = nil
      @http = Http.new
    end
  end
end
