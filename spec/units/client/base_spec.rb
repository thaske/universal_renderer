# frozen_string_literal: true

require "rails_helper"

RSpec.describe UniversalRenderer::Client::Base do
  before do
    UniversalRenderer::Client::HttpPool.reset!
    UniversalRenderer.config.ssr_url = "http://ssr.example.test/render"
    UniversalRenderer.config.timeout = 3
    UniversalRenderer.config.http_pool_size = 1
  end

  after { UniversalRenderer::Client::HttpPool.reset! }

  it "reuses a persistent Net::HTTP connection for sequential requests" do
    http = Net::HTTP.new("ssr.example.test", 80)
    started = false

    allow(http).to receive(:started?) { started }
    allow(http).to receive(:start) do
      started = true
      http
    end

    ok_response_class =
      Class.new(Net::HTTPOK) do
        attr_reader :body

        def initialize(body)
          super("1.1", "200", "OK")
          @body = body
        end
      end
    ok_response =
      ok_response_class.new(
        { head: "", body: "<div>ok</div>", body_attrs: {} }.to_json
      )

    allow(http).to receive(:request).and_return(ok_response)
    allow(Net::HTTP).to receive(:new).and_return(http)

    first = described_class.call("http://example.com/a", {})
    second = described_class.call("http://example.com/b", {})

    expect(first.body).to eq("<div>ok</div>")
    expect(second.body).to eq("<div>ok</div>")
    expect(Net::HTTP).to have_received(:new).once
    expect(http).to have_received(:start).once
    expect(http).to have_received(:request).twice
  end
end
