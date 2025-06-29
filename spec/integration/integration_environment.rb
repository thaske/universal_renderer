# frozen_string_literal: true

require "socket"

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
  # @param engine [Symbol] The engine to set up (:http or :bun_io)
  def setup_engine_resources(engine)
    case engine
    when :http
      # HTTP mode uses real servers - no additional setup needed
    when :bun_io
      # BUN_IO mode uses stubbed processes
      setup_bun_io_stubs
    end
  end

  private

  # Configures UniversalRenderer for integration testing
  def configure_universal_renderer_for_tests(engine: :http)
    UniversalRenderer.configure do |config|
      config.timeout = ENV["CI"] ? 15 : 5 # Longer timeout in CI
      config.engine = engine

      if engine == :bun_io
        config.bun_pool_size = 2
        config.bun_timeout = 3000
        config.bun_cli_script = "spec/fixtures/test_ssr.ts"
      end
    end
  end

  # Sets up BUN_IO mode stubs for testing
  def setup_bun_io_stubs
    # Mock File.exist? for CLI script
    allow(File).to receive(:exist?).and_call_original
    allow(File).to receive(:exist?).with(
      Rails.root.join("spec/fixtures/test_ssr.ts")
    ).and_return(true)

    # Mock Rails.root
    allow(Rails).to receive(:root).and_return(Pathname.new("/fake/rails/root"))

    # Create a mock process that returns canned responses
    @mock_bun_process = instance_double(UniversalRenderer::StdioBunProcess)
    allow(@mock_bun_process).to receive(:render).and_return(
      {
        "head" => "<title>Test BUN_IO Response</title>",
        "body" => "<div>BUN_IO rendered content</div>",
        "body_attrs" => {
        }
      }
    )

    # Mock the process pool
    @mock_pool = instance_double(ConnectionPool)
    allow(@mock_pool).to receive(:with).and_yield(@mock_bun_process)

    allow(ConnectionPool).to receive(:new).and_return(@mock_pool)
    allow(UniversalRenderer::StdioBunProcess).to receive(:new).and_return(
      @mock_bun_process
    )
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
