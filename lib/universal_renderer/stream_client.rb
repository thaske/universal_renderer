# frozen_string_literal: true

require_relative "stream_client/setup"
require_relative "stream_client/execution"
require_relative "stream_client/error_logger"

module UniversalRenderer
  class StreamClient
    extend Setup
    extend Execution
    extend ErrorLogger

    # Orchestrates the streaming process for server-side rendering.
    #
    # @param url [String] The URL of the page to render.
    # @param props [Hash] Data to be passed for rendering, including layout HTML.
    # @param template [String] The HTML template to use for rendering.
    # @param response [ActionDispatch::Response] The Rails response object to stream to.
    # @return [Boolean] True if streaming was initiated, false otherwise.
    def self.stream(url, props, template, response)
      config = UniversalRenderer.config

      unless Setup._ensure_ssr_server_url_configured?(config)
        Rails.logger.warn(
          "StreamClient: SSR URL (config.ssr_url) is not configured. Falling back."
        )
        return false
      end

      stream_uri_obj = nil
      full_ssr_url_for_log = config.ssr_url.to_s # For logging in case of early error

      begin
        body = { url: url, props: props, template: template }

        actual_stream_uri, http_client, http_post_request =
          Setup._build_stream_request_components(body, config)

        stream_uri_obj = actual_stream_uri

        full_ssr_url_for_log = actual_stream_uri.to_s # Update for more specific logging
      rescue URI::InvalidURIError => e
        Rails.logger.error(
          "StreamClient: SSR stream failed due to invalid URI ('#{config.ssr_url}'): #{e.message}"
        )

        return false
      rescue StandardError => e
        _log_setup_error(e, full_ssr_url_for_log)

        return false
      end

      Execution._perform_streaming(
        http_client,
        http_post_request,
        response,
        stream_uri_obj
      )
    rescue Errno::ECONNREFUSED,
           Errno::EHOSTUNREACH,
           Net::OpenTimeout,
           Net::ReadTimeout,
           SocketError => e
      uri_str_for_conn_error =
        stream_uri_obj ? stream_uri_obj.to_s : full_ssr_url_for_log

      ErrorLogger._log_connection_error(e, uri_str_for_conn_error)

      false
    rescue StandardError => e
      uri_str_for_unexpected_error =
        stream_uri_obj ? stream_uri_obj.to_s : full_ssr_url_for_log

      ErrorLogger._log_unexpected_error(
        e,
        uri_str_for_unexpected_error,
        "StreamClient: Unexpected error during SSR stream process"
      )

      false
    end
  end
end
