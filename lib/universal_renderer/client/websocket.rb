# frozen_string_literal: true

require "websocket-client-simple"
require "json"
require "concurrent"

module UniversalRenderer
  module Client
    # WebSocket client for communicating with the SSR service over WebSocket connections.
    # This replaces the HTTP-based communication with real-time bidirectional WebSocket messaging.
    class WebSocket
      class ConnectionError < StandardError
      end
      class TimeoutError < StandardError
      end

      # Performs an SSR request over WebSocket connection
      #
      # @param url [String] The URL of the page to render on the SSR server
      # @param props [Hash] A hash of props to be passed to the SSR service
      # @return [UniversalRenderer::SSR::Response, nil] The SSR payload or nil on failure
      def self.call(url, props)
        client = new
        begin
          client.connect
          client.ssr_request(url, props)
        ensure
          client.disconnect
        end
      end

      # Performs streaming SSR over WebSocket connection
      #
      # @param url [String] The URL of the page to render
      # @param props [Hash] Data to be passed for rendering
      # @param template [String] The HTML template to use for rendering
      # @param response [ActionDispatch::Response] The Rails response object to stream to
      # @return [Boolean] True if streaming was initiated, false otherwise
      def self.stream(url, props, template, response)
        client = new
        begin
          client.connect
          client.stream_request(url, props, template, response)
        ensure
          client.disconnect
        end
      end

      def initialize
        @ws = nil
        @connected = false
        @pending_requests = Concurrent::Hash.new
        @request_counter = Concurrent::AtomicFixnum.new(0)
      end

      def connect
        return if @connected

        ws_url = build_websocket_url
        return false if ws_url.nil?

        begin
          @ws = ::WebSocket::Client::Simple.connect(ws_url)
          setup_event_handlers
          wait_for_connection
          @connected = true
          true
        rescue ConnectionError
          # Re-raise connection errors for timeout scenarios
          raise
        rescue StandardError => e
          Rails.logger.error("WebSocket connection failed: #{e.message}")
          false
        end
      end

      def disconnect
        return unless @connected

        @ws&.close
        @ws = nil
        @connected = false
      end

      def ssr_request(url, props)
        return nil unless @connected

        request_id = generate_request_id
        message = {
          id: request_id,
          type: "ssr_request",
          payload: {
            url: url,
            props: props
          }
        }

        future = send_request_with_timeout(message, request_id)

        begin
          result = future.value!(UniversalRenderer.config.timeout)

          if result.is_a?(Hash) && result[:head] || result[:body]
            UniversalRenderer::SSR::Response.new(
              head: result[:head],
              body: result[:body] || result[:body_html],
              body_attrs: result[:body_attrs]
            )
          else
            nil
          end
        rescue Concurrent::TimeoutError
          Rails.logger.error("WebSocket SSR request timed out for URL: #{url}")
          nil
        rescue StandardError => e
          Rails.logger.error("WebSocket SSR request failed: #{e.message}")
          nil
        end
      end

      def stream_request(url, props, template, response)
        return false unless @connected

        request_id = generate_request_id
        message = {
          id: request_id,
          type: "stream_request",
          payload: {
            url: url,
            props: props,
            template: template
          }
        }

        # Set up streaming response handler
        setup_streaming_handler(request_id, response)

        begin
          @ws.send(message.to_json)
          true
        rescue StandardError => e
          Rails.logger.error("WebSocket stream request failed: #{e.message}")
          false
        end
      end

      def health_check
        return false unless @connected

        request_id = generate_request_id
        message = { id: request_id, type: "health_check", payload: {} }

        future = send_request_with_timeout(message, request_id)

        begin
          result = future.value!(5) # 5 second timeout for health checks
          result.is_a?(Hash) && result[:status] == "ok"
        rescue StandardError
          false
        end
      end

      private

      def build_websocket_url
        ssr_url = UniversalRenderer.config.ssr_url
        return nil if ssr_url.blank?

        # Convert HTTP URL to WebSocket URL
        uri = URI.parse(ssr_url)

        # Check if the URI has the required components
        if uri.host.nil? || uri.scheme.nil?
          Rails.logger.error(
            "Invalid SSR URL for WebSocket: missing scheme or host"
          )
          return nil
        end

        scheme = uri.scheme == "https" ? "wss" : "ws"
        "#{scheme}://#{uri.host}:#{uri.port}#{uri.path}"
      rescue URI::InvalidURIError => e
        Rails.logger.error("Invalid SSR URL for WebSocket: #{e.message}")
        nil
      end

      def setup_event_handlers
        @ws.on :message do |msg|
          handle_message(msg.data)
        end

        @ws.on :error do |e|
          Rails.logger.error("WebSocket error: #{e.message}")
        end

        @ws.on :close do |e|
          Rails.logger.info(
            "WebSocket connection closed: #{e.code} - #{e.reason}"
          )
          @connected = false
        end
      end

      def handle_message(data)
        begin
          message = JSON.parse(data, symbolize_names: true)
          request_id = message[:id]

          case message[:type]
          when "ssr_response", "health_response"
            complete_request(request_id, message[:payload])
          when "stream_start"
            # Streaming started, no action needed
          when "stream_chunk"
            handle_stream_chunk(request_id, message[:payload])
          when "stream_end"
            handle_stream_end(request_id)
          when "error"
            complete_request(
              request_id,
              StandardError.new(message[:payload][:message])
            )
          end
        rescue JSON::ParserError => e
          Rails.logger.error("Failed to parse WebSocket message: #{e.message}")
        end
      end

      def setup_streaming_handler(request_id, response)
        @pending_requests[request_id] = {
          type: :stream,
          response: response,
          future: nil
        }
      end

      def handle_stream_chunk(request_id, chunk)
        request_data = @pending_requests[request_id]
        return unless request_data && request_data[:type] == :stream

        begin
          request_data[:response].stream.write(chunk)
        rescue StandardError => e
          Rails.logger.error("Failed to write stream chunk: #{e.message}")
        end
      end

      def handle_stream_end(request_id)
        request_data = @pending_requests.delete(request_id)
        return unless request_data && request_data[:type] == :stream

        begin
          request_data[:response].stream.close
        rescue StandardError => e
          Rails.logger.error("Failed to close stream: #{e.message}")
        end
      end

      def send_request_with_timeout(message, request_id)
        future =
          Concurrent::Promises.future do
            promise = Concurrent::Promises.resolvable_future
            @pending_requests[request_id] = {
              type: :request,
              promise: promise,
              future: nil
            }

            @ws.send(message.to_json)
            promise.value!
          end

        @pending_requests[request_id][:future] = future
        future
      end

      def complete_request(request_id, result)
        request_data = @pending_requests.delete(request_id)
        return unless request_data && request_data[:type] == :request

        if result.is_a?(StandardError)
          request_data[:promise].reject(result)
        else
          request_data[:promise].fulfill(result)
        end
      end

      def generate_request_id
        "req_#{@request_counter.increment}_#{Time.now.to_f}"
      end

      def wait_for_connection
        # Wait up to 5 seconds for connection to be established
        timeout = Time.now + 5
        while Time.now < timeout &&
                @ws.ready_state != ::WebSocket::Client::Simple::OPEN
          sleep(0.01)
        end

        unless @ws.ready_state == ::WebSocket::Client::Simple::OPEN
          raise ConnectionError, "Failed to establish WebSocket connection"
        end
      end
    end
  end
end
