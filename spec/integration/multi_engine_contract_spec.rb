# frozen_string_literal: true

require "rails_helper"
require_relative "integration_helper"
require_relative "shared_examples/contract_examples"

RSpec.describe "Multi-Engine Contract Integration", type: :integration do
  include IntegrationHelpers

  describe "HTTP Engine" do
    let(:server_url) { setup_test_ssr_server }

    before(:all) { setup_integration_environment(engine: :http) }
    after(:all) { teardown_integration_environment }

    it_behaves_like "SSR contract compliance", :http
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

  describe "BUN_IO Engine" do
    before(:all) { setup_integration_environment(engine: :bun_io) }
    after(:all) { teardown_integration_environment }

    it_behaves_like "SSR contract compliance", :bun_io
    it_behaves_like "non-streaming adapter"

    describe "BUN_IO-specific features" do
      it "uses the correct adapter" do
        adapter = UniversalRenderer::AdapterFactory.adapter
        expect(adapter).to be_a(UniversalRenderer::Adapter::BunIo)
      end

      it "handles adapter configuration correctly" do
        expect(UniversalRenderer.config.engine).to eq(:bun_io)
        expect(UniversalRenderer.config.bun_pool_size).to eq(2)
        expect(UniversalRenderer.config.bun_timeout).to eq(3000)
      end

      it "processes rendering through stdio interface" do
        result =
          test_bun_io_adapter(
            url: "http://example.com/bun-io-test",
            props: {
              test_mode: "bun_io"
            }
          )

        expect(result[:success]).to be true
        expect(result[:response]).to be_a(UniversalRenderer::SSR::Response)
        expect(result[:response].head).to include("Test BUN_IO Response")
        expect(result[:response].body).to include("BUN_IO rendered content")
      end
    end
  end

  describe "Engine comparison" do
    it "both engines produce SSR::Response objects" do
      # Test HTTP engine
      setup_integration_environment(engine: :http)
      server_url = setup_test_ssr_server

      http_result = test_ssr_endpoint(server_url)
      expect(http_result[:json]).to have_key(:head)
      expect(http_result[:json]).to have_key(:body)

      cleanup_ssr_servers

      # Test BUN_IO engine
      setup_integration_environment(engine: :bun_io)

      bun_io_result = test_bun_io_adapter
      expect(bun_io_result[:response]).to be_a(UniversalRenderer::SSR::Response)
      expect(bun_io_result[:response].head).to be_a(String)
      expect(bun_io_result[:response].body).to be_a(String)
    end
  end
end
