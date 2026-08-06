# frozen_string_literal: true

UniversalRenderer.configure do |c|
  # External Node/Bun SSR server. The generated bin/web starts it on the same
  # host as your app server, so loopback is the normal case.
  #
  # The gem never reads ENV itself; bind whatever keys you like here. `SSR_PORT`
  # is what the NPM package's startServer reads, so keep the two in agreement.
  c.url = ENV.fetch("UNIVERSAL_RENDERER_URL", "http://localhost:3001")

  # Keep this above the renderer's renderTimeout (10s by default). A render that
  # outlives this timeout keeps its concurrency slot until it finishes, so giving
  # up first only fills the renderer's queue with work nobody is waiting for.
  c.timeout = 3

  # Must match the `paths` option passed to createServer on the Node side. Both
  # default to the paths createServer already mounts, so leave them alone unless
  # you moved the endpoints — and move both sides together. A mismatch is a 404,
  # which this gem treats as a failed render and answers with a client-rendered
  # page, so nothing tells you the paths disagree.
  #
  #   # config/initializers/universal_renderer.rb
  #   c.render_path = "/render"
  #
  #   // the SSR entry point
  #   await startServer({ ...config, paths: { render: "/render" } });
  #
  # render_path defaults to whatever path `url` already carries; stream_path to
  # "/stream".

  c.http.pool_size = 5

  # Sanitizing the render is defense in depth over HTML your own renderer
  # produced — it is a blocklist, so it is not a boundary against
  # attacker-controlled markup. Escape untrusted data inside the render itself.
  #
  # It also costs real CPU on every request, since it parses and rewrites the
  # whole document. Turning it off is a reasonable trade once you are confident
  # about what the renderer emits:
  #
  # c.sanitize = false
  #
  # Or keep sanitizing and widen what survives:
  # c.scrubber = MyScrubber.new

  # Every SSR failure falls back to client-side rendering silently. Subscribe to
  # the notification to see how often that happens:
  #
  #   ActiveSupport::Notifications.subscribe("render.universal_renderer") do |event|
  #     StatsD.timing("ssr.duration", event.duration,
  #                   tags: ["outcome:#{event.payload[:outcome]}"])
  #   end
  #
  # ...and/or route configured-render errors to your exception tracker
  # (`:not_configured` is notification-only):
  # c.on_error = ->(error, context) { Sentry.capture_exception(error, extra: context) }

  # The concern is included into every ActionController::Base descendant by
  # default. Set this to false and `include UniversalRenderer::Renderable` in
  # just the controllers that render server-side.
  # c.auto_include = false
end
