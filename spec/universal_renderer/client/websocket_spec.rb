# frozen_string_literal: true

require "rails_helper"
require "websocket-client-simple"
require "concurrent"

RSpec.describe UniversalRenderer::Client::WebSocket do
  let(:test_url) { "http://example.com/test" }
  let(:test_props) { { user: "testuser", id: 123 } }
  let(:mock_ws) do
    double("WebSocket::Client::Simple").tap do |ws|
      allow(ws).to receive(:send)
      allow(ws).to receive(:close)
      allow(ws).to receive(:on)
      allow(ws).to receive(:ready_state).and_return(1)
    end
  end
  let(:mock_response) { double("ActionDispatch::Response") }
  let(:mock_stream) { double("ActionDispatch::Response::Stream") }

  before do
    UniversalRenderer.configure do |config|
      config.ssr_url = "ws://localhost:3000"
      config.use_websockets = true
      config.timeout = 5
    end

    allow(Rails.logger).to receive(:error)
    allow(Rails.logger).to receive(:info)

    # Mock WebSocket constants
    stub_const("::WebSocket::Client::Simple::OPEN", 1)
    stub_const("::WebSocket::Client::Simple::CONNECTING", 0)
  end

  describe ".call" do
    context "when connection is successful" do
      let(:client) { described_class.new }
      let(:ssr_response_data) do
        {
          head: "<title>Test Page</title>",
          body: "<div>Test content</div>",
          body_attrs: 'class="test"'
        }
      end

      before do
        allow(described_class).to receive(:new).and_return(client)
        allow(client).to receive(:connect).and_return(true)
        allow(client).to receive(:disconnect)
        allow(client).to receive(:ssr_request).and_return(
          UniversalRenderer::SSR::Response.new(
            head: ssr_response_data[:head],
            body: ssr_response_data[:body],
            body_attrs: ssr_response_data[:body_attrs]
          )
        )
      end

      it "creates a client, connects, makes request, and disconnects" do
        result = described_class.call(test_url, test_props)

        expect(client).to have_received(:connect)
        expect(client).to have_received(:ssr_request).with(test_url, test_props)
        expect(client).to have_received(:disconnect)
        expect(result).to be_a(UniversalRenderer::SSR::Response)
        expect(result.head).to eq(ssr_response_data[:head])
        expect(result.body).to eq(ssr_response_data[:body])
        expect(result.body_attrs).to eq(ssr_response_data[:body_attrs])
      end
    end

    context "when connection fails" do
      let(:client) { described_class.new }

      before do
        allow(described_class).to receive(:new).and_return(client)
        allow(client).to receive(:connect).and_return(false)
        allow(client).to receive(:disconnect)
        allow(client).to receive(:ssr_request).and_return(nil)
      end

      it "still attempts to disconnect" do
        result = described_class.call(test_url, test_props)

        expect(client).to have_received(:connect)
        expect(client).to have_received(:disconnect)
        expect(result).to be_nil
      end
    end
  end

  describe ".stream" do
    let(:client) { described_class.new }
    let(:template) { "<html><body>{{content}}</body></html>" }

    before do
      allow(described_class).to receive(:new).and_return(client)
      allow(client).to receive(:connect).and_return(true)
      allow(client).to receive(:disconnect)
      allow(client).to receive(:stream_request).and_return(true)
    end

    it "creates a client, connects, makes stream request, and disconnects" do
      result =
        described_class.stream(test_url, test_props, template, mock_response)

      expect(client).to have_received(:connect)
      expect(client).to have_received(:stream_request).with(
        test_url,
        test_props,
        template,
        mock_response
      )
      expect(client).to have_received(:disconnect)
      expect(result).to be true
    end
  end

  describe "#connect" do
    let(:client) { described_class.new }

    context "when already connected" do
      before { client.instance_variable_set(:@connected, true) }

      it "returns early without attempting connection" do
        expect(::WebSocket::Client::Simple).not_to receive(:connect)
        expect(client.connect).to be_nil
      end
    end

    context "when SSR URL is blank" do
      before do
        allow(UniversalRenderer.config).to receive(:ssr_url).and_return("")
      end

      it "returns false" do
        expect(client.connect).to be false
      end
    end

    context "when connection succeeds" do
      before do
        allow(::WebSocket::Client::Simple).to receive(:connect).and_return(
          mock_ws
        )
        allow(mock_ws).to receive(:ready_state).and_return(1) # OPEN state
        allow(mock_ws).to receive(:on)
        allow(client).to receive(:setup_event_handlers)
        allow(client).to receive(:wait_for_connection)
      end

      it "establishes connection and returns true" do
        result = client.connect

        expect(::WebSocket::Client::Simple).to have_received(:connect).with(
          "ws://localhost:3000"
        )
        expect(client).to have_received(:setup_event_handlers)
        expect(result).to be true
      end
    end

    context "when connection fails" do
      before do
        allow(::WebSocket::Client::Simple).to receive(:connect).and_raise(
          StandardError.new("Connection failed")
        )
      end

      it "logs error and returns false" do
        result = client.connect

        expect(Rails.logger).to have_received(:error).with(
          "WebSocket connection failed: Connection failed"
        )
        expect(result).to be false
      end
    end

    context "when connection times out" do
      before do
        allow(::WebSocket::Client::Simple).to receive(:connect).and_return(
          mock_ws
        )
        allow(mock_ws).to receive(:ready_state).and_return(0) # CONNECTING state
        allow(mock_ws).to receive(:on)
        allow(client).to receive(:setup_event_handlers)
        allow(client).to receive(:wait_for_connection).and_raise(
          UniversalRenderer::Client::WebSocket::ConnectionError
        )
      end

      it "raises ConnectionError" do
        expect { client.connect }.to raise_error(
          UniversalRenderer::Client::WebSocket::ConnectionError
        )
      end
    end
  end

  describe "#disconnect" do
    let(:client) { described_class.new }

    context "when connected" do
      before do
        client.instance_variable_set(:@connected, true)
        client.instance_variable_set(:@ws, mock_ws)
        allow(mock_ws).to receive(:close)
      end

      it "closes connection and resets state" do
        client.disconnect

        expect(mock_ws).to have_received(:close)
        expect(client.instance_variable_get(:@ws)).to be_nil
        expect(client.instance_variable_get(:@connected)).to be false
      end
    end

    context "when not connected" do
      it "returns early without error" do
        expect { client.disconnect }.not_to raise_error
      end
    end
  end

  describe "#ssr_request" do
    let(:client) { described_class.new }
    let(:request_id) { "test_request_123" }
    let(:response_data) do
      {
        head: "<title>Test</title>",
        body: "<div>Content</div>",
        body_attrs: 'class="page"'
      }
    end

    before do
      client.instance_variable_set(:@connected, true)
      client.instance_variable_set(:@ws, mock_ws)
      allow(client).to receive(:generate_request_id).and_return(request_id)
      allow(mock_ws).to receive(:send)
    end

    context "when not connected" do
      before { client.instance_variable_set(:@connected, false) }

      it "returns nil" do
        result = client.ssr_request(test_url, test_props)
        expect(result).to be_nil
      end
    end

    context "when request succeeds" do
      let(:future) { Concurrent::Promises.fulfilled_future(response_data) }

      before do
        allow(client).to receive(:send_request_with_timeout).and_return(future)
      end

      it "sends request and returns SSR response" do
        result = client.ssr_request(test_url, test_props)

        expect(client).to have_received(:send_request_with_timeout).with(
          {
            id: request_id,
            type: "ssr_request",
            payload: {
              url: test_url,
              props: test_props
            }
          },
          request_id
        )

        expect(result).to be_a(UniversalRenderer::SSR::Response)
        expect(result.head).to eq(response_data[:head])
        expect(result.body).to eq(response_data[:body])
        expect(result.body_attrs).to eq(response_data[:body_attrs])
      end
    end

    context "when request times out" do
      let(:future) do
        Concurrent::Promises.rejected_future(Concurrent::TimeoutError.new)
      end

      before do
        allow(client).to receive(:send_request_with_timeout).and_return(future)
        allow(future).to receive(:value!).and_raise(Concurrent::TimeoutError)
      end

      it "logs timeout error and returns nil" do
        result = client.ssr_request(test_url, test_props)

        expect(Rails.logger).to have_received(:error).with(
          "WebSocket SSR request timed out for URL: #{test_url}"
        )
        expect(result).to be_nil
      end
    end

    context "when request fails" do
      let(:future) do
        Concurrent::Promises.rejected_future(
          StandardError.new("Request failed")
        )
      end

      before do
        allow(client).to receive(:send_request_with_timeout).and_return(future)
        allow(future).to receive(:value!).and_raise(
          StandardError.new("Request failed")
        )
      end

      it "logs error and returns nil" do
        result = client.ssr_request(test_url, test_props)

        expect(Rails.logger).to have_received(:error).with(
          "WebSocket SSR request failed: Request failed"
        )
        expect(result).to be_nil
      end
    end
  end

  describe "#stream_request" do
    let(:client) { described_class.new }
    let(:request_id) { "test_stream_123" }
    let(:template) { "<html>{{content}}</html>" }

    before do
      client.instance_variable_set(:@connected, true)
      client.instance_variable_set(:@ws, mock_ws)
      allow(client).to receive(:generate_request_id).and_return(request_id)
      allow(client).to receive(:setup_streaming_handler)
      allow(mock_ws).to receive(:send)
    end

    context "when not connected" do
      before { client.instance_variable_set(:@connected, false) }

      it "returns false" do
        result =
          client.stream_request(test_url, test_props, template, mock_response)
        expect(result).to be false
      end
    end

    context "when request succeeds" do
      it "sets up streaming handler and sends request" do
        result =
          client.stream_request(test_url, test_props, template, mock_response)

        expect(client).to have_received(:setup_streaming_handler).with(
          request_id,
          mock_response
        )
        expect(mock_ws).to have_received(:send).with(
          {
            id: request_id,
            type: "stream_request",
            payload: {
              url: test_url,
              props: test_props,
              template: template
            }
          }.to_json
        )
        expect(result).to be true
      end
    end

    context "when sending fails" do
      before do
        allow(mock_ws).to receive(:send).and_raise(
          StandardError.new("Send failed")
        )
      end

      it "logs error and returns false" do
        result =
          client.stream_request(test_url, test_props, template, mock_response)

        expect(Rails.logger).to have_received(:error).with(
          "WebSocket stream request failed: Send failed"
        )
        expect(result).to be false
      end
    end
  end

  describe "#health_check" do
    let(:client) { described_class.new }
    let(:request_id) { "test_health_123" }

    before do
      client.instance_variable_set(:@connected, true)
      client.instance_variable_set(:@ws, mock_ws)
      allow(client).to receive(:generate_request_id).and_return(request_id)
      allow(mock_ws).to receive(:send)
    end

    context "when not connected" do
      before { client.instance_variable_set(:@connected, false) }

      it "returns false" do
        result = client.health_check
        expect(result).to be false
      end
    end

    context "when health check succeeds" do
      let(:future) { Concurrent::Promises.fulfilled_future({ status: "ok" }) }

      before do
        allow(client).to receive(:send_request_with_timeout).and_return(future)
      end

      it "returns true" do
        result = client.health_check
        expect(result).to be true
      end
    end

    context "when health check fails" do
      let(:future) do
        Concurrent::Promises.rejected_future(
          StandardError.new("Health check failed")
        )
      end

      before do
        allow(client).to receive(:send_request_with_timeout).and_return(future)
        allow(future).to receive(:value!).and_raise(
          StandardError.new("Health check failed")
        )
      end

      it "returns false" do
        result = client.health_check
        expect(result).to be false
      end
    end
  end

  describe "#handle_message" do
    let(:client) { described_class.new }

    context "with valid JSON message" do
      let(:message_data) do
        '{"id":"test123","type":"ssr_response","payload":{"body":"test"}}'
      end

      before { allow(client).to receive(:complete_request) }

      it "parses message and calls appropriate handler" do
        client.send(:handle_message, message_data)

        expect(client).to have_received(:complete_request).with(
          "test123",
          { body: "test" }
        )
      end
    end

    context "with invalid JSON" do
      let(:invalid_message) { "invalid json" }

      it "logs parse error" do
        client.send(:handle_message, invalid_message)

        expect(Rails.logger).to have_received(:error).with(
          /Failed to parse WebSocket message/
        )
      end
    end

    context "with stream messages" do
      let(:client) { described_class.new }
      let(:request_id) { "stream123" }

      before do
        allow(mock_response).to receive(:stream).and_return(mock_stream)
        allow(mock_stream).to receive(:write)
        allow(mock_stream).to receive(:close)

        pending_requests = client.instance_variable_get(:@pending_requests)
        pending_requests[request_id] = {
          type: :stream,
          response: mock_response,
          future: nil
        }
      end

      it "handles stream_chunk messages" do
        message = {
          id: request_id,
          type: "stream_chunk",
          payload: "<div>chunk</div>"
        }.to_json
        client.send(:handle_message, message)

        expect(mock_stream).to have_received(:write).with("<div>chunk</div>")
      end

      it "handles stream_end messages" do
        message = { id: request_id, type: "stream_end", payload: {} }.to_json
        client.send(:handle_message, message)

        expect(mock_stream).to have_received(:close)
      end
    end
  end

  describe "private methods" do
    let(:client) { described_class.new }

    describe "#build_websocket_url" do
      context "with HTTP URL" do
        before do
          allow(UniversalRenderer.config).to receive(:ssr_url).and_return(
            "http://localhost:3000/path"
          )
        end

        it "converts to WebSocket URL" do
          url = client.send(:build_websocket_url)
          expect(url).to eq("ws://localhost:3000/path")
        end
      end

      context "with HTTPS URL" do
        before do
          allow(UniversalRenderer.config).to receive(:ssr_url).and_return(
            "https://example.com:8080"
          )
        end

        it "converts to secure WebSocket URL" do
          url = client.send(:build_websocket_url)
          expect(url).to eq("wss://example.com:8080")
        end
      end

      context "with invalid URL" do
        before do
          allow(UniversalRenderer.config).to receive(:ssr_url).and_return(
            "invalid-url"
          )
        end

        it "logs error and returns nil" do
          url = client.send(:build_websocket_url)

          expect(Rails.logger).to have_received(:error).with(
            /Invalid SSR URL for WebSocket/
          )
          expect(url).to be_nil
        end
      end

      context "with blank URL" do
        before do
          allow(UniversalRenderer.config).to receive(:ssr_url).and_return("")
        end

        it "returns nil" do
          url = client.send(:build_websocket_url)
          expect(url).to be_nil
        end
      end
    end

    describe "#generate_request_id" do
      it "generates unique request IDs" do
        id1 = client.send(:generate_request_id)
        id2 = client.send(:generate_request_id)

        expect(id1).to match(/^req_\d+_\d+\.\d+$/)
        expect(id2).to match(/^req_\d+_\d+\.\d+$/)
        expect(id1).not_to eq(id2)
      end
    end
  end
end
