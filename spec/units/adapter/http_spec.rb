# frozen_string_literal: true

require "rails_helper"

RSpec.describe UniversalRenderer::Adapter::Http do
  let(:adapter) { described_class.new }
  let(:url) { "http://example.com/test" }
  let(:props) { { "title" => "Test Page" } }
  let(:template) do
    "<html><head><!-- SSR_HEAD --></head><body><!-- SSR_BODY --></body></html>"
  end
  let(:response) { instance_double(ActionDispatch::Response) }

  describe "#call" do
    it "delegates to UniversalRenderer::Client::Base.call" do
      expected_response = instance_double(UniversalRenderer::SSR::Response)

      expect(UniversalRenderer::Client::Base).to receive(:call).with(
        url,
        props
      ).and_return(expected_response)

      result = adapter.call(url, props)
      expect(result).to eq(expected_response)
    end
  end

  describe "#stream" do
    it "delegates to UniversalRenderer::Client::Stream.call" do
      expect(UniversalRenderer::Client::Stream).to receive(:call).with(
        url,
        props,
        template,
        response
      ).and_return(true)

      result = adapter.stream(url, props, template, response)
      expect(result).to be true
    end
  end

  describe "#supports_streaming?" do
    it "returns true" do
      expect(adapter.supports_streaming?).to be true
    end
  end
end
