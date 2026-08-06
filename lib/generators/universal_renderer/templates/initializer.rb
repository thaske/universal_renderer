# frozen_string_literal: true

UniversalRenderer.configure do |c|
  # External Node/Bun SSR server. bin/web starts it on the same host, so loopback
  # is the normal case. The gem never reads ENV itself; bind the keys you want
  # here. `SSR_PORT` is what startServer reads, so keep the two in agreement.
  c.url = ENV.fetch("UNIVERSAL_RENDERER_URL", "http://localhost:3001")

  # Keep this above the renderer's renderTimeout (10s by default). A render keeps
  # its slot until it finishes, so giving up first fills the queue with work
  # nobody is waiting for.
  c.timeout = 3

  # Must match the `paths` option passed to createServer. Both default to what
  # createServer already mounts, so change them only in pairs. A mismatch is a
  # 404, which this gem treats as a failed render, so nothing reports it.
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

  # Sanitizing is a blocklist, so it is defense in depth over HTML your own
  # renderer produced, not a boundary against attacker-controlled markup. It also
  # parses and rewrites the whole document on every request. Turning it off is a
  # reasonable trade once you are confident about what the renderer emits:
  #
  # c.sanitize = false
  #
  # Or keep sanitizing and widen what survives:
  # c.scrubber = MyScrubber.new

  # Every SSR failure falls back to client rendering silently. Subscribe to see
  # how often that happens:
  #
  #   ActiveSupport::Notifications.subscribe("render.universal_renderer") do |event|
  #     StatsD.timing("ssr.duration", event.duration,
  #                   tags: ["outcome:#{event.payload[:outcome]}"])
  #   end
  #
  # ...and/or route configured-render errors to your exception tracker
  # (`:not_configured` is notification-only):
  # c.on_error = ->(error, context) { Sentry.capture_exception(error, extra: context) }

  # Included into every ActionController::Base descendant by default. Set false
  # and include the concern only where you render server-side.
  # c.auto_include = false
end
