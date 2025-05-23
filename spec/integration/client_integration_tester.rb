# frozen_string_literal: true

require "stringio"

module ClientIntegrationTester
  # Tests Ruby gem client integration with real SSR server
  #
  # @param base_url [String] Base URL of the SSR server
  # @return [Hash] Test results for Ruby client integration
  def test_ruby_client_integration(base_url)
    results = {}

    # Configure the gem to use our test server
    original_ssr_url = UniversalRenderer.config.ssr_url
    UniversalRenderer.config.ssr_url = base_url

    begin
      # Test UniversalRenderer::Client::Base
      results[:base_client] = test_base_client_integration

      # Test UniversalRenderer::Client::Stream
      results[:stream_client] = test_stream_client_integration
    ensure
      # Restore original configuration
      UniversalRenderer.config.ssr_url = original_ssr_url
    end

    results
  end

  private

  # Tests the base client integration
  def test_base_client_integration
    test_url = "http://example.com/integration-test"
    test_props = {
      user_id: 123,
      page_title: "Integration Test",
      nested: {
        data: "value"
      }
    }

    begin
      response = UniversalRenderer::Client::Base.call(test_url, test_props)

      {
        success: !response.nil?,
        response: response,
        has_head: response&.head&.length.to_i > 0,
        has_body: response&.body&.length.to_i > 0,
        response_class: response.class.name
      }
    rescue StandardError => e
      { success: false, error: e.message, error_class: e.class.name }
    end
  end

  # Tests the stream client integration
  def test_stream_client_integration
    # Create a mock Rails response object for streaming
    mock_response = create_mock_rails_response

    test_url = "http://example.com/stream-test"
    test_props = { stream_test: true }
    test_template = <<~HTML
      <!DOCTYPE html>
      <html>
      <head>
        <!-- SSR_HEAD -->
      </head>
      <body>
        <div id="root">
          <!-- SSR_BODY -->
        </div>
      </body>
      </html>
    HTML

    begin
      result =
        UniversalRenderer::Client::Stream.call(
          test_url,
          test_props,
          test_template,
          mock_response
        )

      {
        success: result == true,
        stream_content: mock_response.stream_content,
        stream_closed: mock_response.stream_closed?
      }
    rescue StandardError => e
      { success: false, error: e.message, error_class: e.class.name }
    end
  end

  # Creates a mock Rails response object for testing
  def create_mock_rails_response
    MockRailsResponse.new
  end

  # Mock Rails response class for testing streaming
  class MockRailsResponse
    attr_reader :stream_content

    def initialize
      @stream_content = StringIO.new
      @stream_closed = false
    end

    def stream
      @stream ||= MockStream.new(@stream_content, method(:mark_stream_closed))
    end

    def stream_closed?
      @stream_closed
    end

    private

    def mark_stream_closed
      @stream_closed = true
    end

    class MockStream
      def initialize(content_io, close_callback)
        @content_io = content_io
        @close_callback = close_callback
        @closed = false
      end

      def write(data)
        raise IOError, "Stream is closed" if @closed
        @content_io.write(data)
      end

      def close
        return if @closed
        @closed = true
        @close_callback.call
      end

      def closed?
        @closed
      end
    end
  end
end
