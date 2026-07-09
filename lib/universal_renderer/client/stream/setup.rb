require_relative "../http_pool"

module UniversalRenderer
  module Client
    class Stream
      module Setup
        def self.ensure_ssr_server_url_configured?(config)
          config.url.present?
        end

        def self.build_stream_request_components(body, config)
          # Ensure ssr_url is present, though ensure_ssr_server_url_configured? should have caught this.
          # However, direct calls to this method might occur, so a check or reliance on config.url is important.
          raise ArgumentError, "SSR URL is not configured." if config.url.blank?

          parsed_ssr_url = URI.parse(config.url)
          stream_uri = URI.join(parsed_ssr_url, config.stream_path)

          http = HttpPool.client(stream_uri, config.timeout)

          http_request =
            Net::HTTP::Post.new(
              stream_uri.request_uri,
              "Content-Type" => "application/json"
            )

          http_request.body = body.to_json

          [stream_uri, http, http_request]
        end
      end
    end
  end
end
