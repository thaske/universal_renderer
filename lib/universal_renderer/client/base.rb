# frozen_string_literal: true

require "net/http"
require "json"
require "uri"
require_relative "http_pool"

module UniversalRenderer
  module Client
    # Fetches server-side rendered (SSR) content from the Node.js service
    # in a single, blocking request. This client is used when SSR content
    # is needed in its entirety before the Rails view rendering proceeds,
    # as opposed to streaming SSR.
    class Base
      # Performs a POST request to the SSR service to retrieve the complete SSR content.
      # This is used for non-streaming SSR, where the entire payload is fetched
      # before the main application view is rendered.
      #
      # Emits a `render.universal_renderer` notification for every attempt and
      # routes failures through `config.on_error`.
      #
      # @param url [String] The URL of the page to render on the SSR server.
      #   This should typically be the `request.original_url` from the controller.
      # @param props [Hash] A hash of props to be passed to the SSR service.
      #   These props will be available to the frontend components for rendering.
      # @return [UniversalRenderer::SSR::Response, nil] The SSR payload wrapped in
      #   a {UniversalRenderer::SSR::Response} struct when the request is successful
      #   (HTTP 2xx). Returns `nil` when the request fails or the SSR service is
      #   unreachable.
      def self.call(url, props)
        config = UniversalRenderer.config
        ssr_url = config.url

        Instrumentation.instrument(url: url, mode: :blocking) do |event|
          if ssr_url.blank?
            event[:outcome] = :not_configured
            next nil
          end

          perform(ssr_url, config, url, props, event)
        end
      end

      def self.perform(ssr_url, config, url, props, event)
        # A nil render_path means the path in `url` is already the endpoint.
        parsed = URI.parse(ssr_url)
        uri =
          if config.render_path.present?
            URI.join(parsed, absolute_path(config.render_path))
          else
            parsed
          end

        request = Net::HTTP::Post.new(uri.request_uri)
        request.body = { url: url, props: props }.to_json
        request["Content-Type"] = "application/json"

        response = HttpPool.request(uri, config.timeout, request)

        unless response.is_a?(Net::HTTPSuccess)
          event[:outcome] = :http_error
          event[:status] = response.code.to_i
          fail_render(
            url,
            uri,
            event,
            "responded with #{response.code} #{response.message}"
          )
          return nil
        end

        build_response(JSON.parse(response.body))
      rescue Net::OpenTimeout, Net::ReadTimeout => e
        event[:outcome] = :timeout
        event[:error] = e
        fail_render(url, uri, event, "timed out: #{e.class.name} - #{e.message}", e)
        nil
      rescue StandardError => e
        event[:outcome] = :error
        event[:error] = e
        fail_render(url, uri, event, "failed: #{e.class.name} - #{e.message}", e)
        nil
      end

      # String keys on purpose: `payload` can be a large dehydrated query cache,
      # and deep-symbolizing it would walk and re-allocate all of it per render.
      #
      # The three keys that reach a view helper are type-checked, so a renderer
      # answering 200 with the wrong shape falls back like any other failed
      # render instead of raising mid-layout. `perform` rescues the TypeError.
      def self.build_response(data)
        unless data.is_a?(Hash)
          raise TypeError,
                "SSR service returned #{data.class.name}, expected a JSON object"
        end

        UniversalRenderer::SSR::Response.new(
          head: string_or_nil(data["head"]),
          body: string_or_nil(data["body"]),
          body_attrs: (data["body_attrs"] if data["body_attrs"].is_a?(Hash)),
          payload: data["payload"]
        )
      end

      def self.string_or_nil(value)
        value if value.is_a?(String)
      end

      # URI.join replaces the base URL's last path segment when the joined path is
      # relative, which would post renders to the wrong endpoint.
      def self.absolute_path(path)
        path = path.to_s
        path.start_with?("/") ? path : "/#{path}"
      end

      def self.fail_render(url, uri, event, message, error = nil)
        target = uri ? uri.to_s : UniversalRenderer.config.url.to_s

        UniversalRenderer.log do |log|
          log.error("SSR fetch request to #{target} #{message} (URL: #{url})")
        end

        Instrumentation.report(
          error || StandardError.new("SSR fetch request #{message}"),
          event.merge(target: target)
        )
      end

      private_class_method :perform, :build_response, :string_or_nil,
                           :fail_render, :absolute_path
    end
  end
end
