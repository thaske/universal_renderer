# frozen_string_literal: true

module UniversalRenderer
  # Configuration for UniversalRenderer.
  #
  # Plain Ruby defaults only. Binding these to ENV is the host application's job,
  # done in the generated initializer.
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
    #
    # Keep this above the renderer's own `renderTimeout` (10s by default). A
    # render that outlives this timeout keeps its concurrency slot until it
    # finishes, so giving up first only fills the renderer's queue with work
    # nobody is waiting for.
    attr_accessor :timeout

    # Path the blocking renderer is mounted at. Must match the `paths.render`
    # option given to `createServer`, whose default mounts `/` and `/static`.
    #
    # Defaults to nil, meaning the path already in `url`. A relative value is
    # treated as absolute, since joining it relatively would replace the last
    # path segment of `url`.
    attr_accessor :render_path

    # Path the streaming renderer is mounted at on the SSR service. Must match
    # the `paths.stream` option given to `createServer` in the NPM package.
    # Normalized the same way as `render_path`.
    attr_accessor :stream_path

    # Whether `ssr_head`/`ssr_body` run the renderer's HTML through Loofah.
    #
    # {SSR::Scrubber} is a blocklist, so this is defense in depth over HTML your
    # own renderer produced, not a boundary against attacker-controlled markup.
    # It also parses and rewrites the whole document on every request. On by
    # default, because the cost is bounded and the mistake it catches is not.
    attr_accessor :sanitize

    # Scrubber instance used when `sanitize` is true. Defaults to
    # {UniversalRenderer::SSR::Scrubber}; assign your own Loofah::Scrubber to
    # widen or narrow what survives.
    attr_accessor :scrubber

    # Whether the Rails engine includes {UniversalRenderer::Renderable} into
    # every ActionController::Base descendant. Turn it off and include the
    # concern only in the controllers that render server-side.
    attr_accessor :auto_include

    # Optional callable invoked as `call(error, context)` when a configured
    # render fails, where `context` carries at least `:url` and `:outcome`. A
    # missing `url` reports `:not_configured` through the notification only.
    #
    # Errors are always logged; this exists so they can also reach an exception
    # tracker, since every failure falls back to client rendering silently.
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
