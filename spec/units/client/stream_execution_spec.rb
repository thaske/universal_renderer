# frozen_string_literal: true

require "rails_helper"

RSpec.describe UniversalRenderer::Client::Stream::Execution do
  let(:http_request) { Net::HTTP::Post.new("/stream") }
  let(:stream_uri) { URI.parse("http://ssr.example.test/stream") }
  let(:http_client) { double("http_client") }
  let(:stream) do
    Class.new do
      attr_reader :body

      def initialize
        @body = +""
        @closed = false
      end

      def write(chunk)
        @body << chunk
      end

      def close
        @closed = true
      end

      def closed?
        @closed
      end
    end.new
  end
  let(:response) { double("response", stream: stream) }

  before do
    allow(Rails.logger).to receive(:error)
  end

  def perform_with(node_response, upstream_connection = nil)
    allow(http_client).to receive(:request)
      .with(http_request)
      .and_yield(node_response, upstream_connection)

    described_class.perform_streaming(
      http_client,
      http_request,
      response,
      stream_uri
    )
  end

  it "returns true and closes the stream after a complete successful stream" do
    node_response = Net::HTTPOK.new("1.1", "200", "OK")
    allow(node_response).to receive(:read_body).and_yield("<html>").and_yield("</html>")

    result = perform_with(node_response)

    expect(result).to be true
    expect(stream.body).to eq("<html></html>")
    expect(stream).to be_closed
  end

  it "returns true and closes the stream when transfer fails after chunks were written" do
    node_response = Net::HTTPOK.new("1.1", "200", "OK")
    upstream_connection = instance_double(Net::HTTP, started?: true, finish: nil)
    allow(node_response).to receive(:read_body) do |&block|
      block.call("<html>")
      raise IOError, "client disconnected"
    end

    result = perform_with(node_response, upstream_connection)

    expect(result).to be true
    expect(stream.body).to eq("<html>")
    expect(stream).to be_closed
    expect(upstream_connection).to have_received(:finish)
  end

  it "returns true when Net::HTTP fails while finalizing a partial response" do
    node_response = Net::HTTPOK.new("1.1", "200", "OK")
    upstream_connection = instance_double(Net::HTTP, started?: true, finish: nil)
    allow(node_response).to receive(:read_body).and_yield("<html>")
    allow(http_client).to receive(:request)
      .with(http_request) do |&block|
        block.call(node_response, upstream_connection)
        raise IOError, "upstream failed while finishing response"
      end

    result = described_class.perform_streaming(
      http_client,
      http_request,
      response,
      stream_uri
    )

    expect(result).to be true
    expect(stream.body).to eq("<html>")
    expect(stream).to be_closed
    expect(upstream_connection).to have_received(:finish)
  end

  it "returns false and leaves the stream open when transfer fails before writing chunks" do
    node_response = Net::HTTPOK.new("1.1", "200", "OK")
    allow(node_response).to receive(:read_body).and_raise(IOError, "upstream failed")

    result = perform_with(node_response)

    expect(result).to be false
    expect(stream.body).to eq("")
    expect(stream).not_to be_closed
  end

  it "returns false and leaves the stream open for non-success responses" do
    node_response = Net::HTTPInternalServerError.new("1.1", "500", "Server Error")

    result = perform_with(node_response)

    expect(result).to be false
    expect(stream.body).to eq("")
    expect(stream).not_to be_closed
  end
end
