# frozen_string_literal: true

require "rails_helper"
require_relative "integration_helper"
require_relative "shared_examples/contract_examples"

RSpec.describe "HTTP Engine Contract Integration", type: :integration do
  include IntegrationHelpers

  let(:server_url) { setup_test_ssr_server }

  before(:all) { setup_integration_environment }
  after(:all) { teardown_integration_environment }

  it_behaves_like "SSR contract compliance"
  it_behaves_like "streaming SSR support"

  describe "HTTP-specific features" do
    it "responds with valid health status" do
      result = test_health_endpoint(server_url)

      expect(result[:success]).to be true
      expect(result[:status]).to eq 200
      expect(result[:json]).to include(status: "OK", timestamp: be_a(String))
    end

    it "handles concurrent requests" do
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
end
