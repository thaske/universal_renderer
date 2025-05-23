# frozen_string_literal: true

require "rails_helper"
require_relative "integration_helper"

RSpec.describe "HTTP Contract Integration - Server Health",
               type: :integration do
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
      expect { Time.zone.parse(timestamp) }.not_to raise_error
    end
  end
end

RSpec.describe "HTTP Contract Integration - Standard SSR", type: :integration do
  include IntegrationHelpers

  let(:server_url) { setup_test_ssr_server }

  before(:all) { setup_integration_environment }
  after(:all) { teardown_integration_environment }

  context "when handling basic requests" do
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
  end

  context "when processing HTML content" do
    it "returns HTML content in head and body fields" do
      result = test_ssr_endpoint(server_url)

      expect(result[:success]).to be true
      expect(result[:json][:head]).to include("<meta")
      expect(result[:json][:body]).to include("<div")
    end
  end

  context "when handling empty props" do
    it "handles empty props correctly" do
      result = test_ssr_endpoint(server_url, props: {})

      expect(result[:success]).to be true
      expect(result[:json]).to be_a(Hash)
      expect(result[:json]).to have_key(:head)
      expect(result[:json]).to have_key(:body)
    end
  end

  context "when handling complex nested props" do
    it "processes complex nested data structures" do
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
end

RSpec.describe "HTTP Contract Integration - Streaming SSR",
               type: :integration do
  include IntegrationHelpers

  let(:server_url) { setup_test_ssr_server }
  let(:test_template) { <<~HTML }
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

  before(:all) { setup_integration_environment }
  after(:all) { teardown_integration_environment }

  context "when accepting requests" do
    it "accepts valid streaming requests" do
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
      expect(result[:content_errors]).to be_nil
    end
  end

  context "when handling content type" do
    it "returns HTML content type" do
      result = test_stream_endpoint(server_url, template: test_template)

      expect(result[:success]).to be true
      expect(result[:headers]["content-type"].join).to include("text/html")
    end
  end

  context "when processing templates" do
    it "replaces SSR markers in the template" do
      result = test_stream_endpoint(server_url, template: test_template)

      expect(result[:success]).to be true
      expect(result[:body]).not_to include("<!-- SSR_HEAD -->")
      expect(result[:body]).not_to include("<!-- SSR_BODY -->")
      expect(result[:body]).to include("<html")
      expect(result[:body]).to include("</html>")
    end
  end

  context "when injecting content" do
    it "injects streaming-specific head content" do
      result = test_stream_endpoint(server_url, template: test_template)

      expect(result[:success]).to be true
      expect(result[:body]).to include('<meta name="stream-test"')
    end
  end
end

RSpec.describe "HTTP Contract Integration - Error Handling",
               type: :integration do
  include IntegrationHelpers

  let(:server_url) { setup_test_ssr_server }

  before(:all) { setup_integration_environment }
  after(:all) { teardown_integration_environment }

  context "when handling error contracts" do
    it "returns appropriate error responses for various scenarios" do
      error_results = test_error_contracts(server_url)

      expect(error_results[:missing_url][:status]).to eq 400
      expect(error_results[:missing_template][:status]).to eq 400
      expect(error_results[:invalid_json][:status]).to be >= 400
      expect(error_results[:not_found][:status]).to eq 404
    end
  end

  context "when providing error messages" do
    it "provides meaningful error messages in responses" do
      error_results = test_error_contracts(server_url)

      missing_url_result = error_results[:missing_url]
      if missing_url_result[:body].present?
        expect(missing_url_result[:body]).to include("URL")
      end
    end
  end
end

RSpec.describe "HTTP Contract Integration - Ruby Client", type: :integration do
  include IntegrationHelpers

  let(:server_url) { setup_test_ssr_server }

  before(:all) { setup_integration_environment }
  after(:all) { teardown_integration_environment }

  context "when using base client functionality" do
    it "integrates properly with UniversalRenderer::Client::Base" do
      results = test_ruby_client_integration(server_url)

      base_result = results[:base_client]
      expect(base_result[:success]).to be true
      expect(base_result[:response]).to be_a(UniversalRenderer::SSR::Response)
      expect(base_result[:has_head]).to be true
      expect(base_result[:has_body]).to be true
    end
  end

  context "when handling client configuration" do
    it "handles client configuration correctly" do
      original_timeout = UniversalRenderer.config.timeout

      UniversalRenderer.config.timeout = 2
      results = test_ruby_client_integration(server_url)

      expect(results[:base_client][:success]).to be true

      UniversalRenderer.config.timeout = original_timeout
    end
  end

  context "when using streaming client" do
    it "integrates with streaming client" do
      results = test_ruby_client_integration(server_url)

      stream_result = results[:stream_client]
      expect(stream_result[:success]).to be true
      expect(stream_result[:stream_closed]).to be true
      expect(stream_result[:stream_content]).to be_a(StringIO)
    end
  end
end

RSpec.describe "HTTP Contract Integration - Full Test Suite",
               type: :integration do
  include IntegrationHelpers

  let(:server_url) { setup_test_ssr_server }

  before(:all) { setup_integration_environment }
  after(:all) { teardown_integration_environment }

  context "when running comprehensive validation" do
    it "passes comprehensive contract validation" do
      results = run_full_contract_test_suite(server_url)

      expect(results[:fatal_error]).to be_nil

      summary = results[:summary]
      expect(summary[:total_tests]).to be > 0
      expect(summary[:success_rate]).to be >= 90.0
      expect(summary[:endpoints_tested]).to include(
        "health",
        "ssr",
        "stream",
        "error_handling"
      )
    end
  end

  context "when checking test result details" do
    it "provides detailed test results" do
      results = run_full_contract_test_suite(server_url)

      expect(results[:health]).to be_a(Hash)
      expect(results[:ssr]).to be_a(Hash)
      expect(results[:stream]).to be_a(Hash)
      expect(results[:errors]).to be_a(Hash)

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
end

RSpec.describe "HTTP Contract Integration - Performance", type: :integration do
  include IntegrationHelpers

  let(:server_url) { setup_test_ssr_server }

  before(:all) { setup_integration_environment }
  after(:all) { teardown_integration_environment }

  context "when handling concurrent requests" do
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

      results.each_value do |result|
        expect(result[:success]).to be true
        expect(result[:status]).to eq 200
      end
    end
  end

  context "when testing load performance" do
    it "maintains performance under load" do
      start_time = Time.current

      10.times { test_ssr_endpoint(server_url, props: { load_test: true }) }

      end_time = Time.current
      total_time = end_time - start_time

      expect(total_time).to be < 10.0
    end
  end
end
