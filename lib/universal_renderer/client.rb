# frozen_string_literal: true

require "net/http"
require "json"
require "uri"

module UniversalRenderer
  # Fetches server-side rendered (SSR) content from the Node.js service
  # in a single, blocking request. This client is used when SSR content
  # is needed in its entirety before the Rails view rendering proceeds,
  # as opposed to streaming SSR.
  class Client
    class << self
      # Performs a POST request to the SSR service to retrieve the complete SSR content.
      # This is used for non-streaming SSR, where the entire payload is fetched
      # before the main application view is rendered.
      #
      # @param url [String] The URL of the page to render on the SSR server.
      #   This should typically be the `request.original_url` from the controller.
      # @param props [Hash] A hash of props to be passed to the SSR service.
      #   These props will be available to the frontend components for rendering.
      # @return [Hash, nil] The parsed JSON response from the SSR service with symbolized keys
      #   if the request is successful (HTTP 2xx). The structure of the hash depends
      #   on the SSR service implementation but typically includes keys like `:head`,
      #   `:body_html`, and `:body_attrs`.
      #   Returns `nil` if:
      #   - The `ssr_url` is not configured.
      #   - The request times out (open or read).
      #   - The SSR service returns a non-successful HTTP status code.
      #   - Any other `StandardError` occurs during the request.
      #   In case of failures, an error message is logged to `Rails.logger`.
      def fetch(url, props)
        ssr_url = UniversalRenderer.config.ssr_url
        return if ssr_url.blank?

        timeout = UniversalRenderer.config.timeout

        begin
          uri = URI.parse(ssr_url)
          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = (uri.scheme == "https")
          http.open_timeout = timeout
          http.read_timeout = timeout

          request = Net::HTTP::Post.new(uri.request_uri)
          request.body = { url: url, props: props }.to_json
          request["Content-Type"] = "application/json"

          response = http.request(request)

          if response.is_a?(Net::HTTPSuccess)
            JSON.parse(response.body).deep_symbolize_keys
          else
            Rails.logger.error(
              "SSR fetch request to #{ssr_url} failed: #{response.code} - #{response.message} (URL: #{url})"
            )
            nil
          end
        rescue Net::OpenTimeout, Net::ReadTimeout => e
          Rails.logger.error(
            "SSR fetch request to #{ssr_url} timed out: #{e.class.name} - #{e.message} (URL: #{url})"
          )
          nil
        rescue StandardError => e
          Rails.logger.error(
            "SSR fetch request to #{ssr_url} failed: #{e.class.name} - #{e.message} (URL: #{url})"
          )
          nil
        end
      end
    end
  end
end
