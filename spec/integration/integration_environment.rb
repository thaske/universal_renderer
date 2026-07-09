# frozen_string_literal: true

require "socket"
require "universal_renderer/adapter/stdio"

module IntegrationEnvironment
  # Sets up integration test environment
  def setup_integration_environment(engine: :http)
    # Ensure we have a clean environment
    cleanup_ssr_servers

    # Configure UniversalRenderer for testing
    configure_universal_renderer_for_tests(engine: engine)

    # Set up engine-specific resources
    setup_engine_resources(engine)
  end

  # Tears down integration test environment
  def teardown_integration_environment
    cleanup_ssr_servers
    reset_universal_renderer_config
  end

  # Spawns a test SSR server and returns its base URL (HTTP mode only)
  #
  # @param config [Hash] Server configuration options
  # @return [String] Base URL of the spawned server
  def setup_test_ssr_server(**config)
    port = config[:port] || find_free_port
    hostname = config[:hostname] || "127.0.0.1" # Use IPv4 explicitly

    spawn_ssr_server(port: port, hostname: hostname, **config)

    "http://#{hostname}:#{port}"
  end

  # Sets up test resources for the given engine
  #
  # @param engine [Symbol] The engine to set up (:http or :stdio)
  def setup_engine_resources(engine)
    case engine
    when :http
      # HTTP mode uses real servers - no additional setup needed
    when :stdio
      # Stdio mode uses stubbed processes - but don't set up mocks here
      # Mocks will be set up in before(:each) blocks
    end
  end

  private

  # Configures UniversalRenderer for integration testing
  def configure_universal_renderer_for_tests(engine: :http)
    UniversalRenderer.configure do |config|
      config.timeout = ENV["CI"] ? 15 : 5 # Longer timeout in CI
      config.adapter = engine

      if %i[stdio].include?(engine)
        config.stdio.pool_size = 2
        config.stdio.timeout_ms = 3000
        config.stdio.cli_script = "spec/fixtures/test_ssr.ts"
      end
    end
  end

  # Sets up STDIO mode stubs for testing
  # This should be called from within a before(:each) block to ensure proper RSpec mock lifecycle
  def setup_stdio_stubs
    # Mock Rails.root first
    allow(Rails).to receive(:root).and_return(Pathname.new("/fake/rails/root"))

    # Mock File.exist? for CLI script
    allow(File).to receive(:exist?).and_call_original
    allow(File).to receive(:exist?).with(
      Pathname.new("/fake/rails/root/spec/fixtures/test_ssr.ts")
    ).and_return(true)

    # Create a mock process that returns canned responses
    mock_bun_process =
      instance_double(UniversalRenderer::Adapter::Stdio::StdioProcess)
    allow(mock_bun_process).to receive(:render).and_return(
      {
        "head" => "<title>Test STDIO Response</title>",
        "body" => "<div>STDIO rendered content</div>",
        "body_attrs" => {
        }
      }
    )
    allow(mock_bun_process).to receive(
      :render_stream
    ) do |_url, _props, _template, &block|
      block.call("<html>")
      block.call("chunk-1")
      block.call("chunk-2")
      block.call("</html>")
      true
    end

    # Mock the process pool
    mock_pool = instance_double(ConnectionPool)
    allow(mock_pool).to receive(:with).and_yield(mock_bun_process)

    allow(ConnectionPool).to receive(:new).and_return(mock_pool)
    allow(UniversalRenderer::Adapter::Stdio::StdioProcess).to receive(
      :new
    ).and_return(mock_bun_process)
  end

  # Resets UniversalRenderer configuration
  def reset_universal_renderer_config
    UniversalRenderer.instance_variable_set(:@config, nil)
  end

  # Finds an available port for testing
  def find_free_port
    server = TCPServer.new("127.0.0.1", 0) # Use IPv4 explicitly
    port = server.addr[1]
    server.close
    port
  end
end
