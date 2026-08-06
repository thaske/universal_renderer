# frozen_string_literal: true

require "rails_helper"

RSpec.describe UniversalRenderer::Instrumentation do
  let(:events) { [] }
  let(:reported) { [] }
  let(:subscription) do
    ActiveSupport::Notifications.subscribe(described_class::NOTIFICATION) do |event|
      events << event
    end
  end

  before do
    UniversalRenderer::Client::HttpPool.reset!
    UniversalRenderer.config.url = "http://ssr.example.test"
    UniversalRenderer.config.on_error = ->(error, context) { reported << [error, context] }

    subscription
  end

  after do
    ActiveSupport::Notifications.unsubscribe(subscription)
    UniversalRenderer::Client::HttpPool.reset!
    UniversalRenderer.config = UniversalRenderer::Configuration.new
  end

  def stub_http(response)
    allow(UniversalRenderer::Client::HttpPool).to receive(:request).and_return(response)
  end

  def http_response(klass, code, body)
    Class
      .new(klass) do
        attr_reader :body

        define_method(:initialize) do |payload|
          super("1.1", code, "Status")
          @body = payload
        end
      end
      .new(body)
  end

  it "records a successful render" do
    stub_http(
      http_response(
        Net::HTTPOK,
        "200",
        { head: "<title>t</title>", body: "<div></div>", payload: { "a" => 1 } }.to_json
      )
    )

    response = UniversalRenderer::Client::Base.call("http://example.com/p", {})

    expect(response.payload).to eq({ a: 1 })
    expect(events.size).to eq(1)
    expect(events.first.payload).to include(
      url: "http://example.com/p",
      mode: :blocking,
      outcome: :ok
    )
    expect(reported).to be_empty
  end

  it "records a not-configured render without touching the network" do
    UniversalRenderer.config.url = nil
    expect(UniversalRenderer::Client::HttpPool).not_to receive(:request)

    expect(UniversalRenderer::Client::Base.call("http://example.com/p", {})).to be_nil
    expect(events.first.payload[:outcome]).to eq(:not_configured)
    expect(reported).to be_empty
  end

  it "records an HTTP error and reports it" do
    stub_http(http_response(Net::HTTPInternalServerError, "500", "boom"))

    expect(UniversalRenderer::Client::Base.call("http://example.com/p", {})).to be_nil

    expect(events.first.payload).to include(outcome: :http_error, status: 500)
    expect(reported.size).to eq(1)
    expect(reported.first.last).to include(outcome: :http_error, status: 500)
  end

  it "records a timeout and reports it" do
    allow(UniversalRenderer::Client::HttpPool).to receive(:request)
      .and_raise(Net::ReadTimeout)

    expect(UniversalRenderer::Client::Base.call("http://example.com/p", {})).to be_nil

    expect(events.first.payload[:outcome]).to eq(:timeout)
    expect(reported.first.first).to be_a(Net::ReadTimeout)
  end

  it "does not let a raising on_error callback break the fallback" do
    UniversalRenderer.config.on_error = ->(*) { raise "tracker down" }
    allow(UniversalRenderer::Client::HttpPool).to receive(:request).and_raise("nope")

    expect { UniversalRenderer::Client::Base.call("http://example.com/p", {}) }
      .not_to raise_error
  end

  it "records an unconfigured stream distinctly without reporting an error" do
    UniversalRenderer.config.url = nil

    expect(
      UniversalRenderer::Client::Stream.call(
        "http://example.com/p",
        {},
        "<html></html>",
        double("response")
      )
    ).to be(false)

    expect(events.first.payload).to include(
      url: "http://example.com/p",
      mode: :streaming,
      outcome: :not_configured
    )
    expect(reported).to be_empty
  end

  it "reports stream HTTP errors with the request URL and status" do
    stream_uri = URI.parse("http://ssr.example.test/stream")
    allow(UniversalRenderer::Client::Stream::Setup)
      .to receive(:build_stream_request_components)
      .and_return([stream_uri, double("http"), double("request")])
    allow(UniversalRenderer::Client::Stream::Execution)
      .to receive(:perform_streaming) do |*, &failure|
        failure.call(
          StandardError.new("SSR stream server responded with 503 Unavailable"),
          outcome: :http_error,
          status: 503,
          stage: :response
        )
        false
      end

    result =
      UniversalRenderer::Client::Stream.call(
        "http://example.com/p",
        {},
        "<html></html>",
        double("response")
      )

    expect(result).to be(false)
    expect(events.first.payload).to include(
      url: "http://example.com/p",
      mode: :streaming,
      outcome: :http_error,
      status: 503
    )
    expect(reported.first.last).to include(
      url: "http://example.com/p",
      outcome: :http_error,
      status: 503,
      stage: :response,
      target: "http://ssr.example.test/stream"
    )
  end

  it "reports an invalid streaming target" do
    UniversalRenderer.config.url = "://invalid"

    result =
      UniversalRenderer::Client::Stream.call(
        "http://example.com/p",
        {},
        "<html></html>",
        double("response")
      )

    expect(result).to be(false)
    expect(events.first.payload).to include(
      url: "http://example.com/p",
      mode: :streaming,
      outcome: :error,
      error: an_instance_of(URI::InvalidURIError)
    )
    expect(reported.first.last).to include(
      url: "http://example.com/p",
      outcome: :error,
      stage: :setup,
      target: "://invalid"
    )
  end

  it "does not report a partial stream failure as successful" do
    stream_uri = URI.parse("http://ssr.example.test/stream")
    allow(UniversalRenderer::Client::Stream::Setup)
      .to receive(:build_stream_request_components)
      .and_return([stream_uri, double("http"), double("request")])
    allow(UniversalRenderer::Client::Stream::Execution)
      .to receive(:perform_streaming) do |*, &failure|
        failure.call(IOError.new("transfer failed"), outcome: :error, stage: :transfer)
        true
      end

    result =
      UniversalRenderer::Client::Stream.call(
        "http://example.com/p",
        {},
        "<html></html>",
        double("response")
      )

    expect(result).to be(true)
    expect(events.first.payload).to include(outcome: :error, error: an_instance_of(IOError))
    expect(reported.first.last).to include(
      url: "http://example.com/p",
      outcome: :error,
      stage: :transfer
    )
  end
end
