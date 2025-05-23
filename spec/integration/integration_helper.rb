# frozen_string_literal: true

require_relative "server_helpers"
require_relative "contract_helpers"

module IntegrationHelpers
  include ServerHelpers
  include ContractHelpers

  # Sets up integration test environment
  def setup_integration_environment
    # Ensure we have a clean environment
    cleanup_ssr_servers

    # Configure UniversalRenderer for testing
    configure_universal_renderer_for_tests
  end

  # Tears down integration test environment
  def teardown_integration_environment
    cleanup_ssr_servers
    reset_universal_renderer_config
  end

  # Spawns a test SSR server and returns its base URL
  #
  # @param config [Hash] Server configuration options
  # @return [String] Base URL of the spawned server
  def setup_test_ssr_server(**config)
    port = config[:port] || find_free_port
    hostname = config[:hostname] || "localhost"

    spawn_ssr_server(port: port, hostname: hostname, **config)

    "http://#{hostname}:#{port}"
  end

  # Runs a comprehensive contract test suite against an SSR server
  #
  # @param base_url [String] Base URL of the SSR server
  # @return [Hash] Complete test results
  def run_full_contract_test_suite(base_url)
    results = { health: nil, ssr: nil, stream: nil, errors: nil, summary: {} }

    begin
      # Test health endpoint
      results[:health] = test_health_endpoint(base_url)

      # Test standard SSR endpoint
      results[:ssr] = test_ssr_endpoint(base_url)

      # Test streaming endpoint
      results[:stream] = test_stream_endpoint(base_url)

      # Test error handling
      results[:errors] = test_error_contracts(base_url)

      # Generate summary
      results[:summary] = generate_test_summary(results)
    rescue StandardError => e
      results[:fatal_error] = {
        message: e.message,
        backtrace: e.backtrace&.first(5)
      }
    end

    results
  end

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

  # Configures UniversalRenderer for integration testing
  def configure_universal_renderer_for_tests
    UniversalRenderer.configure do |config|
      config.timeout = 5 # Shorter timeout for tests
    end
  end

  # Resets UniversalRenderer configuration
  def reset_universal_renderer_config
    UniversalRenderer.instance_variable_set(:@config, nil)
  end

  # Finds an available port for testing
  def find_free_port
    server = TCPServer.new("localhost", 0)
    port = server.addr[1]
    server.close
    port
  end

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

  # Generates a summary of test results
  def generate_test_summary(results)
    summary = {
      total_tests: 0,
      passed: 0,
      failed: 0,
      endpoints_tested: [],
      issues: []
    }

    # Count health endpoint results
    if results[:health]
      summary[:total_tests] += 1
      summary[:endpoints_tested] << "health"

      if results[:health][:success] && !results[:health][:contract_errors]
        summary[:passed] += 1
      else
        summary[:failed] += 1
        summary[
          :issues
        ] << "Health endpoint: #{results[:health][:contract_errors] || "HTTP error"}"
      end
    end

    # Count SSR endpoint results
    if results[:ssr]
      summary[:total_tests] += 1
      summary[:endpoints_tested] << "ssr"

      if results[:ssr][:success] && !results[:ssr][:content_errors]
        summary[:passed] += 1
      else
        summary[:failed] += 1
        summary[
          :issues
        ] << "SSR endpoint: #{results[:ssr][:content_errors] || "HTTP error"}"
      end
    end

    # Count stream endpoint results
    if results[:stream]
      summary[:total_tests] += 1
      summary[:endpoints_tested] << "stream"

      if results[:stream][:success] && !results[:stream][:content_errors]
        summary[:passed] += 1
      else
        summary[:failed] += 1
        summary[
          :issues
        ] << "Stream endpoint: #{results[:stream][:content_errors] || "HTTP error"}"
      end
    end

    # Count error handling tests
    if results[:errors]
      error_tests = results[:errors].keys
      summary[:total_tests] += error_tests.length
      summary[:endpoints_tested] << "error_handling"

      error_tests.each do |test_name|
        error_result = results[:errors][test_name]
        if error_result[:status] && error_result[:status] >= 400
          summary[:passed] += 1
        else
          summary[:failed] += 1
          summary[
            :issues
          ] << "Error test #{test_name}: unexpected status #{error_result[:status]}"
        end
      end
    end

    summary[:success_rate] = (
      if summary[:total_tests] > 0
        (summary[:passed].to_f / summary[:total_tests] * 100).round(2)
      else
        0
      end
    )

    summary
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
