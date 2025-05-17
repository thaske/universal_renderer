# frozen_string_literal: true

require 'net/http'
require 'json' # Ensure JSON is required for parsing and generation
require 'uri' # Ensure URI is required for URI parsing

module UniversalRenderer
  class StaticClient
    class << self
      # Performs a POST request to the SSR service to get statically rendered content.
      #
      # @param url [String] The URL of the page to render.
      # @param props [Hash] Additional data to be passed for rendering (renamed from query_data for clarity).
      # @return [Hash, nil] The parsed JSON response as symbolized keys if successful, otherwise nil.
      def static(url, props)
        ssr_url = UniversalRenderer.config.ssr_url
        return if ssr_url.blank?

        timeout = UniversalRenderer.config.timeout

        begin
          uri = URI.parse(ssr_url)
          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = (uri.scheme == 'https')
          http.open_timeout = timeout
          http.read_timeout = timeout

          request = Net::HTTP::Post.new(uri.request_uri) # Use uri.request_uri to include path if present in ssr_url
          request.body = { url: url, props: props }.to_json
          request['Content-Type'] = 'application/json'

          response = http.request(request)

          if response.is_a?(Net::HTTPSuccess)
            JSON.parse(response.body).deep_symbolize_keys
          else
            Rails.logger.error("SSR static request to #{ssr_url} failed: #{response.code} - #{response.message}")
            nil
          end
        rescue StandardError => e
          Rails.logger.error("SSR static request to #{ssr_url} failed: #{e.class.name} - #{e.message}")
          nil
        end
      end
    end
  end
end
