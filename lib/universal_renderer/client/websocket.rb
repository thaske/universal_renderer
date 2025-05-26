# frozen_string_literal: true

require "faye/websocket"
require "eventmachine"
require "json"

module UniversalRenderer
  module Client
    # WebSocket client for communicating with the SSR service over WebSocket connections.
    # This replaces the HTTP-based communication with real-time bidirectional WebSocket messaging.
    class WebSocket
      class ConnectionError < StandardError
      end
      class TimeoutError < StandardError
      end

      # Thread-safe connection pool for managing WebSocket connections
      @@connection_pool = {}
      @@pool_mutex = Mutex.new
      @@em_thread = nil

      # Performs an SSR request over WebSocket connection
      #
      # @param url [String] The URL of the page to render on the SSR server
      # @param props [Hash] A hash of props to be passed to the SSR service
      # @return [UniversalRenderer::SSR::Response, nil] The SSR payload or nil on failure
      def self.call(url, props)
        client = get_or_create_client
        return nil unless client

        begin
          client.ssr_request(url, props)
        rescue StandardError => e
          Rails.logger.error("WebSocket SSR request failed: #{e.message}")
          nil
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
        client = get_or_create_client
        return false unless client

        begin
          client.stream_request(url, props, template, response)
        rescue StandardError => e
          Rails.logger.error("WebSocket stream request failed: #{e.message}")
          false
        end
      end

      # Get or create a thread-safe WebSocket client
      def self.get_or_create_client
        thread_id = Thread.current.object_id

        @@pool_mutex.synchronize do
          client = @@connection_pool[thread_id]

          # Create new client if none exists or if existing client is disconnected
          if client.nil? || !client.connected?
            # Remove the old client if it exists but is disconnected
            @@connection_pool.delete(thread_id) if client && !client.connected?

            client = new
            if client.connect
              @@connection_pool[thread_id] = client
            else
              return nil
            end
          end

          client
        end
      end

      # Clean up connection pool
      def self.cleanup_pool
        @@pool_mutex.synchronize do
          @@connection_pool.each_value(&:disconnect)
          @@connection_pool.clear
        end
      end

      def initialize
        @ws = nil
        @connected = false
        @pending_requests = {}
        @request_counter = 0
        @connection_mutex = Mutex.new
      end

      def connected?
        @connected && !@ws.nil?
      end

      def connect
        @connection_mutex.synchronize do
          return true if connected?

          ws_url = build_websocket_url
          return false if ws_url.nil?

          begin
            # Ensure EventMachine is running
            ensure_eventmachine_running

            @ws = Faye::WebSocket::Client.new(ws_url)
            setup_event_handlers

            # Wait for connection to be established
            wait_for_connection
            true
          rescue StandardError => e
            Rails.logger.error("WebSocket connection failed: #{e.message}")
            @connected = false
            false
          end
        end
      end

      def disconnect
        @connection_mutex.synchronize do
          return unless @connected

          @ws&.close
          @ws = nil
          @connected = false
        end
      end

      def ssr_request(url, props)
        return nil unless connected?

        request_id = generate_request_id
        message = {
          id: request_id,
          type: "ssr_request",
          payload: {
            url: url,
            props: props
          }
        }

        begin
          future = send_request_with_timeout(message, request_id)
          result = future.value(UniversalRenderer.config.timeout)

          if result.is_a?(Hash) && (result[:head] || result[:body])
            UniversalRenderer::SSR::Response.new(
              head: result[:head],
              body: result[:body] || result[:body_html],
              body_attrs: result[:body_attrs] || result[:bodyAttrs]
            )
          else
            nil
          end
        rescue Timeout::Error
          Rails.logger.error("WebSocket SSR request timed out for URL: #{url}")
          nil
        rescue StandardError => e
          Rails.logger.error("WebSocket SSR request failed: #{e.message}")
          @connected = false
          nil
        end
      end

      def stream_request(url, props, template, response)
        return false unless connected?

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
        return false unless connected?

        request_id = generate_request_id
        message = { id: request_id, type: "health_check", payload: {} }

        future = send_request_with_timeout(message, request_id)

        begin
          result = future.value(5) # 5 second timeout for health checks
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
        @ws.on :open do |event|
          @connected = true
        end

        @ws.on :message do |event|
          handle_message(event.data)
        end

        @ws.on :error do |event|
          Rails.logger.error("WebSocket error: #{event.message}")
          @connected = false
        end

        @ws.on :close do |event|
          Rails.logger.info(
            "WebSocket connection closed: #{event.code} #{event.reason}"
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
        # Create a simple future-like object using Thread and Queue
        future = SimpleFuture.new

        # Set up the pending request
        @pending_requests[request_id] = { type: :request, future: future }

        begin
          # Send the message
          @ws.send(message.to_json)
        rescue StandardError => e
          # Clean up the pending request if send fails
          @pending_requests.delete(request_id)
          @connected = false
          raise ConnectionError, "Failed to send message: #{e.message}"
        end

        future
      end

      def complete_request(request_id, result)
        request_data = @pending_requests.delete(request_id)
        return unless request_data && request_data[:type] == :request

        if result.is_a?(StandardError)
          request_data[:future].reject(result)
        else
          request_data[:future].resolve(result)
        end
      end

      def generate_request_id
        @request_counter += 1
        "req_#{@request_counter}_#{Time.now.to_f}"
      end

      def ensure_eventmachine_running
        return if EM.reactor_running?

        # Start EventMachine in a separate thread if not already running
        @@em_thread ||=
          Thread.new do
            EM.run do
              # Keep the reactor alive
              EM.add_periodic_timer(1) {} # Dummy timer to keep EM running
            end
          end

        # Wait for EventMachine to start
        timeout = Time.now + 2
        sleep(0.1) while Time.now < timeout && !EM.reactor_running?

        unless EM.reactor_running?
          raise ConnectionError, "Failed to start EventMachine reactor"
        end
      end

      def wait_for_connection
        # Wait up to 5 seconds for connection to be established
        timeout = Time.now + 5
        sleep(0.1) while Time.now < timeout && !@connected

        unless @connected
          raise ConnectionError,
                "Failed to establish WebSocket connection within timeout"
        end
      end

      # Simple future implementation to replace Concurrent::Promises
      class SimpleFuture
        def initialize
          @mutex = Mutex.new
          @condition = ConditionVariable.new
          @resolved = false
          @value = nil
          @error = nil
        end

        def resolve(value)
          @mutex.synchronize do
            return if @resolved
            @value = value
            @resolved = true
            @condition.broadcast
          end
        end

        def reject(error)
          @mutex.synchronize do
            return if @resolved
            @error = error
            @resolved = true
            @condition.broadcast
          end
        end

        def value(timeout = nil)
          @mutex.synchronize do
            unless @resolved
              if timeout
                @condition.wait(@mutex, timeout)
                raise Timeout::Error, "Request timed out" unless @resolved
              else
                @condition.wait(@mutex)
              end
            end

            raise @error if @error
            @value
          end
        end
      end
    end
  end
end
