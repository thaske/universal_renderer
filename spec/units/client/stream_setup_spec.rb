# frozen_string_literal: true

require "rails_helper"

RSpec.describe UniversalRenderer::Client::Stream::Setup do
  describe ".build_stream_request_components" do
    it "treats a relative stream_path as absolute when joining onto the SSR url" do
      config = UniversalRenderer::Configuration.new
      config.url = "http://ssr.example.test/base"
      config.stream_path = "stream"

      uri, _http, request =
        described_class.build_stream_request_components({}, config)

      expect(uri.to_s).to eq("http://ssr.example.test/stream")
      expect(request.path).to eq("/stream")
    end
  end
end
