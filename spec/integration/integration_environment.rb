# frozen_string_literal: true

require "socket"

module IntegrationEnvironment
  # Sets up integration test environment
  def setup_integration_environment
    # Ensure we have a clean environment
    cleanup_ssr_servers

    # Configure UniversalRenderer for testing
    configure_universal_renderer_for_tests
  end

  # Tears down integration test environment
  def teardown_integration_environment
    cleanup_ssr_servers
    reset_universal_renderer_config
  end

  # Spawns a test SSR server and returns its base URL
  #
  # @param config [Hash] Server configuration options
  # @return [String] Base URL of the spawned server
  def setup_test_ssr_server(**config)
    port = config[:port] || find_free_port
    hostname = config[:hostname] || "localhost"

    spawn_ssr_server(port: port, hostname: hostname, **config)

    "http://#{hostname}:#{port}"
  end

  private

  # Configures UniversalRenderer for integration testing
  def configure_universal_renderer_for_tests
    UniversalRenderer.configure do |config|
      config.timeout = 5 # Shorter timeout for tests
    end
  end

  # Resets UniversalRenderer configuration
  def reset_universal_renderer_config
    UniversalRenderer.instance_variable_set(:@config, nil)
  end

  # Finds an available port for testing
  def find_free_port
    server = TCPServer.new("localhost", 0)
    port = server.addr[1]
    server.close
    port
  end
end
