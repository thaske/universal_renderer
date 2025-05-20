module UniversalRenderer
  module Client
    class Stream
      module Setup
        class << self
          def _ensure_ssr_server_url_configured?(config)
            config.ssr_url.present?
          end

          def _build_stream_request_components(body, config)
            # Ensure ssr_url is present, though _ensure_ssr_server_url_configured? should have caught this.
            # However, direct calls to this method might occur, so a check or reliance on config.ssr_url is important.
            if config.ssr_url.blank?
              raise ArgumentError, "SSR URL is not configured."
            end

            parsed_ssr_url = URI.parse(config.ssr_url)
            stream_uri = URI.join(parsed_ssr_url, config.ssr_stream_path)

            http = Net::HTTP.new(stream_uri.host, stream_uri.port)
            http.use_ssl = (stream_uri.scheme == "https")
            http.open_timeout = config.timeout
            http.read_timeout = config.timeout

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
end
