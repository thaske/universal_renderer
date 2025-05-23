# frozen_string_literal: true

require "rails_helper"
require_relative "integration_helper"

RSpec.describe "HTTP Contract Integration", type: :integration do
  include IntegrationHelpers

  let(:server_url) { setup_test_ssr_server }

  before(:all) { setup_integration_environment }
  after(:all) { teardown_integration_environment }

  describe "SSR Server Health Check" do
    it "responds with valid health status" do
      result = test_health_endpoint(server_url)

      expect(result[:success]).to be true
      expect(result[:status]).to eq 200
      expect(result[:json]).to include(status: "OK", timestamp: be_a(String))
      expect(result[:contract_errors]).to be_nil
    end

    it "health endpoint returns proper timestamp format" do
      result = test_health_endpoint(server_url)

      expect(result[:success]).to be true
      timestamp = result[:json][:timestamp]
      expect { Time.parse(timestamp) }.not_to raise_error
    end
  end

  describe "Standard SSR Endpoint Contract" do
    it "accepts valid SSR requests and returns proper JSON structure" do
      test_props = {
        user_id: 123,
        page_data: {
          title: "Test Page",
          meta: "description"
        },
        array_data: [1, 2, 3]
      }

      result =
        test_ssr_endpoint(
          server_url,
          url: "http://example.com/test-page",
          props: test_props
        )

      expect(result[:success]).to be true
      expect(result[:status]).to eq 200
      expect(result[:json]).to include(head: be_a(String), body: be_a(String))
      expect(result[:content_errors]).to be_nil
    end

    it "returns HTML content in head and body fields" do
      result = test_ssr_endpoint(server_url)

      expect(result[:success]).to be true

      # Head should contain meta tag from test setup
      expect(result[:json][:head]).to include("<meta")

      # Body should contain div with test content
      expect(result[:json][:body]).to include("<div")
    end

    it "handles empty props correctly" do
      result = test_ssr_endpoint(server_url, props: {})

      expect(result[:success]).to be true
      expect(result[:json]).to be_a(Hash)
      expect(result[:json]).to have_key(:head)
      expect(result[:json]).to have_key(:body)
    end

    it "handles complex nested props" do
      complex_props = {
        user: {
          id: 123,
          profile: {
            name: "Test User",
            settings: {
              theme: "dark",
              notifications: true
            }
          }
        },
        metadata: {
          page_type: "product",
          tracking: %w[analytics performance]
        }
      }

      result = test_ssr_endpoint(server_url, props: complex_props)

      expect(result[:success]).to be true
      expect(result[:status]).to eq 200
    end
  end

  describe "Streaming SSR Endpoint Contract" do
    it "accepts valid streaming requests and returns HTML" do
      test_template = <<~HTML
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <!-- SSR_HEAD -->
        </head>
        <body>
          <div id="root">
            <!-- SSR_BODY -->
          </div>
          <script>console.log('app loaded');</script>
        </body>
        </html>
      HTML

      result =
        test_stream_endpoint(
          server_url,
          url: "http://example.com/stream-test",
          props: {
            stream_test: true
          },
          template: test_template
        )

      expect(result[:success]).to be true
      expect(result[:status]).to eq 200
      expect(result[:headers]["content-type"].join).to include("text/html")
      expect(result[:content_errors]).to be_nil
    end

    it "replaces SSR markers in the template" do
      result = test_stream_endpoint(server_url)

      expect(result[:success]).to be true

      # SSR markers should be replaced
      expect(result[:body]).not_to include("<!-- SSR_HEAD -->")
      expect(result[:body]).not_to include("<!-- SSR_BODY -->")

      # Should contain basic HTML structure
      expect(result[:body]).to include("<html")
      expect(result[:body]).to include("</html>")
    end

    it "injects streaming-specific head content" do
      result = test_stream_endpoint(server_url)

      expect(result[:success]).to be true

      # Should contain the stream test meta tag from our test callbacks
      expect(result[:body]).to include('<meta name="stream-test"')
    end
  end

  describe "Error Handling Contracts" do
    it "returns appropriate error responses for various scenarios" do
      error_results = test_error_contracts(server_url)

      # Missing URL should return 400
      expect(error_results[:missing_url][:status]).to eq 400

      # Missing template in stream request should return 400
      expect(error_results[:missing_template][:status]).to eq 400

      # Invalid JSON should return 400 or 500
      expect(error_results[:invalid_json][:status]).to be >= 400

      # 404 for non-existent endpoint
      expect(error_results[:not_found][:status]).to eq 404
    end

    it "provides meaningful error messages in responses" do
      error_results = test_error_contracts(server_url)

      # Check that error responses contain some form of error message
      missing_url_result = error_results[:missing_url]
      if missing_url_result[:body] && !missing_url_result[:body].empty?
        expect(missing_url_result[:body]).to include("URL") # Error should mention URL
      end
    end
  end

  describe "Ruby Gem Client Integration" do
    it "integrates properly with UniversalRenderer::Client::Base" do
      results = test_ruby_client_integration(server_url)

      base_result = results[:base_client]
      expect(base_result[:success]).to be true
      expect(base_result[:response]).to be_a(UniversalRenderer::SSR::Response)
      expect(base_result[:has_head]).to be true
      expect(base_result[:has_body]).to be true
    end

    it "handles client configuration correctly" do
      original_timeout = UniversalRenderer.config.timeout

      # Test with custom timeout
      UniversalRenderer.config.timeout = 2
      results = test_ruby_client_integration(server_url)

      expect(results[:base_client][:success]).to be true

      # Restore original timeout
      UniversalRenderer.config.timeout = original_timeout
    end

    it "integrates with streaming client" do
      results = test_ruby_client_integration(server_url)

      stream_result = results[:stream_client]
      expect(stream_result[:success]).to be true
      expect(stream_result[:stream_closed]).to be true
      expect(stream_result[:stream_content]).to be_a(StringIO)
    end
  end

  describe "Full Contract Test Suite" do
    it "passes comprehensive contract validation" do
      results = run_full_contract_test_suite(server_url)

      expect(results[:fatal_error]).to be_nil

      summary = results[:summary]
      expect(summary[:total_tests]).to be > 0
      expect(summary[:success_rate]).to be >= 90.0 # Allow for some expected error scenarios
      expect(summary[:endpoints_tested]).to include(
        "health",
        "ssr",
        "stream",
        "error_handling"
      )
    end

    it "provides detailed test results" do
      results = run_full_contract_test_suite(server_url)

      # Should have results for each major endpoint
      expect(results[:health]).to be_a(Hash)
      expect(results[:ssr]).to be_a(Hash)
      expect(results[:stream]).to be_a(Hash)
      expect(results[:errors]).to be_a(Hash)

      # Summary should contain meaningful metrics
      summary = results[:summary]
      expect(summary).to include(
        :total_tests,
        :passed,
        :failed,
        :success_rate,
        :endpoints_tested
      )
    end
  end

  describe "Performance and Reliability" do
    it "handles multiple concurrent requests" do
      threads = []
      results = {}

      5.times do |i|
        threads << Thread.new do
          results[i] = test_ssr_endpoint(
            server_url,
            url: "http://example.com/concurrent-test-#{i}",
            props: {
              request_id: i
            }
          )
        end
      end

      threads.each(&:join)

      # All requests should succeed
      results.values.each do |result|
        expect(result[:success]).to be true
        expect(result[:status]).to eq 200
      end
    end

    it "maintains performance under load" do
      start_time = Time.now

      10.times { test_ssr_endpoint(server_url, props: { load_test: true }) }

      end_time = Time.now
      total_time = end_time - start_time

      # Should handle 10 requests in reasonable time
      expect(total_time).to be < 10.0 # seconds
    end
  end
end
