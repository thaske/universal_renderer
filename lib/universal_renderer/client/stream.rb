# frozen_string_literal: true

require_relative "stream/error_logger"
require_relative "stream/execution"
require_relative "stream/setup"

module UniversalRenderer
  module Client
    class Stream
      # No `extend` of the three modules below: each defines only singleton
      # methods, so extending imported nothing while reading as though it had.
      # That is what produced a NoMethodError on the setup-error path. Every call
      # site names the module.

      # Orchestrates the streaming process for server-side rendering.
      #
      # @param url [String] The URL of the page to render.
      # @param props [Hash] Data to be passed for rendering, including layout HTML.
      # @param template [String] The HTML template to use for rendering.
      # @param response [ActionDispatch::Response] The Rails response object to stream to.
      # @return [Boolean] True if streaming was initiated, false otherwise.
      def self.call(url, props, template, response)
        Instrumentation.instrument(url: url, mode: :streaming) do |event|
          succeeded = perform(url, props, template, response, event)
          event[:outcome] = :error if !succeeded && event[:outcome] == :ok
          succeeded
        end
      end

      def self.perform(url, props, template, response, event = {})
        initialize_event(event, url)

        config = UniversalRenderer.config

        unless Setup.ensure_ssr_server_url_configured?(config)
          event[:outcome] = :not_configured
          UniversalRenderer.log do |log|
            log.warn(
              "Stream: SSR URL (config.url) is not configured. Falling back."
            )
          end
          return false
        end

        stream_uri_obj = nil
        full_ssr_url_for_log = config.url.to_s # For logging in case of early error

        begin
          body = { url: url, props: props, template: template }

          actual_stream_uri, http_client, http_post_request =
            Setup.build_stream_request_components(body, config)

          stream_uri_obj = actual_stream_uri

          full_ssr_url_for_log = actual_stream_uri.to_s # Update for more specific logging
        rescue URI::InvalidURIError => e
          event[:outcome] = :error
          event[:error] = e
          ErrorLogger.log_setup_error(e, config.url.to_s, event)
          return false
        rescue StandardError => e
          event[:outcome] = :error
          event[:error] = e
          ErrorLogger.log_setup_error(e, full_ssr_url_for_log, event)
          return false
        end

        Execution.perform_streaming(
          http_client,
          http_post_request,
          response,
          stream_uri_obj
        ) do |error, details|
          event.merge!(details)
          event[:error] = error
          Instrumentation.report(
            error,
            event.merge(target: stream_uri_obj.to_s)
          )
        end
      rescue Errno::ECONNREFUSED,
             Errno::EHOSTUNREACH,
             Net::OpenTimeout,
             Net::ReadTimeout,
             SocketError,
             IOError => e
        uri_str_for_conn_error =
          stream_uri_obj ? stream_uri_obj.to_s : full_ssr_url_for_log

        event[:outcome] = failure_outcome(e)
        event[:error] = e
        ErrorLogger.log_connection_error(e, uri_str_for_conn_error, event)

        false
      rescue StandardError => e
        uri_str_for_unexpected_error =
          stream_uri_obj ? stream_uri_obj.to_s : full_ssr_url_for_log

        event[:outcome] = :error
        event[:error] = e
        ErrorLogger.log_unexpected_error(
          e,
          uri_str_for_unexpected_error,
          "Stream: Unexpected error during SSR stream process",
          event
        )

        false
      end

      def self.initialize_event(event, url)
        event[:url] ||= url
        event[:mode] ||= :streaming
        event[:outcome] ||= :ok
      end

      def self.failure_outcome(error)
        return :timeout if error.is_a?(Net::OpenTimeout) ||
                           error.is_a?(Net::ReadTimeout)

        :error
      end

      private_class_method :initialize_event, :failure_outcome
    end
  end
end
