# frozen_string_literal: true

module UniversalRenderer
  # Every SSR failure in this gem is a silent fall back to client-side
  # rendering. That is the right behaviour for availability and the wrong
  # behaviour for operations: without a signal, an app cannot tell a healthy
  # renderer from one that has been down for a week. These two hooks are that
  # signal.
  module Instrumentation
    # ActiveSupport::Notifications event name. Subscribe to record SSR hit rate
    # and latency:
    #
    #   ActiveSupport::Notifications.subscribe("render.universal_renderer") do |event|
    #     StatsD.timing("ssr.duration", event.duration, tags: ["outcome:#{event.payload[:outcome]}"])
    #   end
    #
    # Payload keys: `:url`, `:mode` (`:blocking` or `:streaming`), `:outcome`
    # (`:ok`, `:not_configured`, `:http_error`, `:timeout`, or `:error`),
    # and `:status` / `:error` where applicable.
    NOTIFICATION = "render.universal_renderer"

    module_function

    # Instruments one render attempt. The block receives the mutable payload so
    # it can record the outcome it reached.
    def instrument(url:, mode:)
      payload = { url: url, mode: mode, outcome: :ok }

      ActiveSupport::Notifications.instrument(NOTIFICATION, payload) do
        yield payload
      end
    end

    # Hands an error to `config.on_error`, if one is configured. A raising
    # callback must not turn a degraded render into a failed request.
    def report(error, context)
      callback = UniversalRenderer.config.on_error
      return unless callback

      callback.call(error, context)
    rescue StandardError => e
      UniversalRenderer.log do |log|
        log.error(
          "on_error callback raised: #{e.class.name} - #{e.message}"
        )
      end
    end
  end
end
