# frozen_string_literal: true

require "rails_helper"

RSpec.describe UniversalRenderer::Client::Base do
  before do
    UniversalRenderer::Client::HttpPool.reset!
    UniversalRenderer.config.url = "http://ssr.example.test/render"
    UniversalRenderer.config.timeout = 3
    UniversalRenderer.config.http.pool_size = 1
  end

  after do
    UniversalRenderer::Client::HttpPool.reset!
    UniversalRenderer.config = UniversalRenderer::Configuration.new
  end

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

  def stub_ssr_service(response_body)
    Net::HTTP.new("ssr.example.test", 80).tap do |http|
      response_class =
        Class.new(Net::HTTPOK) do
          attr_reader :body

          def initialize(body)
            super("1.1", "200", "OK")
            @body = body
          end
        end

      allow(http).to receive(:started?).and_return(true)
      allow(http).to receive(:request) do
        response_class.new(response_body.to_json)
      end
      allow(Net::HTTP).to receive(:new).and_return(http)
    end
  end

  it "keeps payload keys as strings rather than deep-symbolizing the response" do
    stub_ssr_service(
      head: "",
      body: "<div>ok</div>",
      body_attrs: {},
      payload: { "queryCache" => { "queries" => [{ "queryKey" => %w[users 1] }] } }
    )

    result = described_class.call("http://example.com/a", {})

    expect(result.payload).to eq(
      "queryCache" => { "queries" => [{ "queryKey" => %w[users 1] }] }
    )
  end

  it "treats a relative render_path as absolute when joining onto the SSR url" do
    UniversalRenderer.config.url = "http://ssr.example.test/base"
    UniversalRenderer.config.render_path = "render"
    http = stub_ssr_service(head: "", body: "", body_attrs: {})

    described_class.call("http://example.com/a", {})

    expect(http).to have_received(:request) do |request|
      expect(request.path).to eq("/render")
    end
  end
end
