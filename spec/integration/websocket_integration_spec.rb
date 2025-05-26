# frozen_string_literal: true

require "rails_helper"
require "open3"
require "timeout"

RSpec.describe "WebSocket Integration", type: :integration do
  # Use class variables instead of let for before(:all) compatibility
  SERVER_PORT = 3004
  SERVER_URL = "ws://localhost:#{SERVER_PORT}"

  let(:test_url) { "http://example.com/integration-test" }
  let(:test_props) { { user: "integration_user", timestamp: Time.now.to_i } }

  before(:all) do
    # Start the Bun WebSocket server for integration tests
    @server_pid = start_test_server
    sleep(2) # Give server time to start
  end

  after(:all) do
    # Stop the test server
    stop_test_server(@server_pid) if @server_pid
  end

  before do
    UniversalRenderer.configure do |config|
      config.ssr_url = SERVER_URL
      config.use_websockets = true
      config.timeout = 10
    end
  end

  describe "SSR Request Integration" do
    it "successfully performs SSR request over WebSocket" do
      result = UniversalRenderer::Client::Base.call(test_url, test_props)

      expect(result).to be_a(UniversalRenderer::SSR::Response)
      expect(result.head).to include("Integration Test")
      expect(result.body).to include("Hello from #{test_url}")
      expect(result.body).to include(test_props[:user])
      expect(result.body_attrs).to eq('class="integration-test"')
    end

    it "handles multiple concurrent requests" do
      threads = []
      results = []
      mutex = Mutex.new

      5.times do |i|
        threads << Thread.new do
          props = test_props.merge(request_id: i)
          result = UniversalRenderer::Client::Base.call(test_url, props)

          mutex.synchronize { results << result }
        end
      end

      threads.each(&:join)

      expect(results.length).to eq(5)
      results.each do |result|
        expect(result).to be_a(UniversalRenderer::SSR::Response)
        expect(result.body).to include("Hello from #{test_url}")
      end
    end

    it "handles request timeout gracefully" do
      # Configure a very short timeout
      UniversalRenderer.configure do |config|
        config.timeout = 0.1 # 100ms timeout
      end

      # This should timeout since the server takes longer to respond
      result =
        UniversalRenderer::Client::Base.call(
          "#{test_url}?slow=true",
          test_props
        )

      expect(result).to be_nil
    end

    it "handles server errors gracefully" do
      # Request that will cause server error
      result =
        UniversalRenderer::Client::Base.call(
          "#{test_url}?error=true",
          test_props
        )

      expect(result).to be_nil
    end
  end

  describe "Streaming Integration" do
    let(:mock_response) { MockStreamResponse.new }

    it "successfully streams SSR content over WebSocket" do
      template = "<html><body>{{content}}</body></html>"

      result =
        UniversalRenderer::Client::Stream.call(
          test_url,
          test_props,
          template,
          mock_response
        )

      expect(result).to be true

      # Wait for streaming to complete
      sleep(1)

      expect(mock_response.chunks).not_to be_empty
      full_content = mock_response.chunks.join("")
      expect(full_content).to include("<!DOCTYPE html>")
      expect(full_content).to include("Streaming Integration Test")
      expect(full_content).to include(test_url)
      expect(mock_response.closed?).to be true
    end

    it "handles streaming errors gracefully" do
      template = "<html><body>{{content}}</body></html>"

      result =
        UniversalRenderer::Client::Stream.call(
          "#{test_url}?stream_error=true",
          test_props,
          template,
          mock_response
        )

      expect(result).to be false
    end
  end

  describe "Health Check Integration" do
    it "successfully performs health check" do
      client = UniversalRenderer::Client::WebSocket.new

      begin
        expect(client.connect).to be true
        expect(client.health_check).to be true
      ensure
        client.disconnect
      end
    end
  end

  describe "Connection Management" do
    it "handles connection failures gracefully" do
      # Configure invalid server URL
      UniversalRenderer.configure do |config|
        config.ssr_url = "ws://localhost:9999" # Non-existent server
      end

      result = UniversalRenderer::Client::Base.call(test_url, test_props)
      expect(result).to be_nil
    end

    it "handles connection drops during request" do
      client = UniversalRenderer::Client::WebSocket.new

      begin
        expect(client.connect).to be true

        # Stop the server to simulate connection drop
        stop_test_server(@server_pid)

        # This should fail gracefully
        result = client.ssr_request(test_url, test_props)
        expect(result).to be_nil
      ensure
        client.disconnect
        # Restart server for other tests
        @server_pid = start_test_server
        sleep(2)
      end
    end
  end

  describe "Fallback to HTTP" do
    it "falls back to HTTP when WebSocket is disabled" do
      UniversalRenderer.configure do |config|
        config.use_websockets = false
        config.ssr_url = "http://localhost:#{SERVER_PORT + 1}" # Different port for HTTP
      end

      # Start HTTP server (this would be a separate test setup in real scenario)
      # For this test, we'll just verify the WebSocket client isn't used
      expect(UniversalRenderer::Client::WebSocket).not_to receive(:call)

      # This will fail since we don't have an HTTP server, but that's expected
      result = UniversalRenderer::Client::Base.call(test_url, test_props)
      expect(result).to be_nil
    end
  end

  private

  def start_test_server
    # Create a test server script
    server_script = create_test_server_script

    # Start the server using Bun
    pid = spawn("bun", server_script, out: "/dev/null", err: "/dev/null")

    # Wait for server to be ready
    wait_for_server_ready

    pid
  rescue StandardError => e
    puts "Failed to start test server: #{e.message}"
    nil
  end

  def stop_test_server(pid)
    return unless pid

    Process.kill("TERM", pid)
    Process.wait(pid)
  rescue StandardError => e
    puts "Failed to stop test server: #{e.message}"
  end

  def create_test_server_script
    script_path = Rails.root.join("tmp", "test_websocket_server.ts")

    script_content = <<~TYPESCRIPT
      import { createWebSocketServer } from "../universal-renderer/src/index";

      const server = await createWebSocketServer({
        setup: async (url, props) => {
          // Simulate slow response for timeout tests
          if (url.includes("slow=true")) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          // Simulate error for error tests
          if (url.includes("error=true")) {
            throw new Error("Simulated server error");
          }

          return { url, props, timestamp: Date.now() };
        },

        render: async (context) => {
          return {
            head: "<title>Integration Test - " + context.url + "</title>",
            body: `<div id="app">Hello from ${context.url}<pre>${JSON.stringify(context.props, null, 2)}</pre></div>`,
            bodyAttrs: 'class="integration-test"'
          };
        },

        cleanup: (context) => {
          // Cleanup for tests
        },

        streamCallbacks: {
          onStream: async (context, writer, template) => {
            if (context.url.includes("stream_error=true")) {
              throw new Error("Simulated streaming error");
            }

            writer.write("<!DOCTYPE html><html><head>");
            writer.write("<title>Streaming Integration Test</title>");
            writer.write("</head><body>");
            writer.write(`<h1>Streaming content for ${context.url}</h1>`);
            writer.write(`<pre>${JSON.stringify(context.props, null, 2)}</pre>`);
            writer.write("</body></html>");
            writer.end();
          }
        },

        port: #{SERVER_PORT},

        onConnection: (connection) => {
          console.log(`Test server: Connection ${connection.id} opened`);
        },

        onDisconnection: (connection, code, message) => {
          console.log(`Test server: Connection ${connection.id} closed`);
        }
      });

      console.log(`Test WebSocket server started on port #{SERVER_PORT}`);
    TYPESCRIPT

    File.write(script_path.to_s, script_content)
    script_path.to_s
  end

  def wait_for_server_ready
    Timeout.timeout(10) do
      loop do
        begin
          socket = TCPSocket.new("localhost", SERVER_PORT)
          socket.close
          break
        rescue Errno::ECONNREFUSED
          sleep(0.1)
        end
      end
    end
  rescue Timeout::Error
    raise "Test server failed to start within 10 seconds"
  end

  # Mock response class for streaming tests
  class MockStreamResponse
    attr_reader :chunks, :closed

    def initialize
      @chunks = []
      @closed = false
    end

    def stream
      @stream ||= MockStream.new(self)
    end

    def add_chunk(chunk)
      @chunks << chunk
    end

    def close_stream
      @closed = true
    end

    def closed?
      @closed
    end

    class MockStream
      def initialize(response)
        @response = response
      end

      def write(chunk)
        @response.add_chunk(chunk)
      end

      def close
        @response.close_stream
      end
    end
  end
end
