# frozen_string_literal: true

UniversalRenderer.configure do |c|
  c.url = ENV.fetch("UNIVERSAL_RENDERER_URL", "http://localhost:3001")

  # Keep this above the renderer's 2.5-second default.
  c.timeout = 3

  c.http.pool_size = 5

  # c.sanitize = false
  # c.scrubber = MyScrubber.new
  # c.auto_include = false
  # c.on_error = ->(error, context) { Sentry.capture_exception(error, extra: context) }
end
