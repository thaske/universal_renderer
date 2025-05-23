# frozen_string_literal: true

require "socket"
require "timeout"
require "fileutils"
require "net/http"
require "uri"
require "json"
require_relative "test_server_generator"

module IntegrationHelpers
  module ServerHelpers
    # Default configuration for test SSR servers
    DEFAULT_HOSTNAME = "127.0.0.1" # Use IPv4 explicitly for better CI compatibility
    DEFAULT_PORT = 9876
    DEFAULT_TIMEOUT = ENV["CI"] ? 30 : 10 # Longer timeout in CI environments

    # Spawns a real SSR server using Bun and the universal-renderer NPM package
    #
    # @param port [Integer] The port to run the server on
    # @param hostname [String] The hostname to bind to
    # @param config [Hash] Additional server configuration
    # @return [Process] The spawned process
    def spawn_ssr_server(
      port: DEFAULT_PORT,
      hostname: DEFAULT_HOSTNAME,
      **config
    )
      ensure_port_available!(hostname, port)

      # Create a temporary directory for the test server
      server_dir = TestServerGenerator.create_directory

      # Write the test server configuration
      TestServerGenerator.write_files(
        server_dir,
        port: port,
        hostname: hostname,
        **config
      )

      # Spawn the Bun process
      process =
        Process.spawn(
          { "NODE_ENV" => "test" },
          "bun",
          "run",
          "server.ts",
          chdir: server_dir,
          out: config[:verbose] ? $stdout : File::NULL,
          err: config[:verbose] ? $stderr : File::NULL,
          pgroup: true
        )

      # Wait for server to be ready
      wait_for_server(hostname, port)

      # Store cleanup info
      @spawned_servers ||= []
      @spawned_servers << { process: process, directory: server_dir }

      process
    end

    # Stops all spawned SSR servers and cleans up resources
    def cleanup_ssr_servers
      return unless @spawned_servers

      @spawned_servers.each do |server_info|
        begin
          # Kill the process group to ensure all child processes are terminated
          Process.kill("TERM", -Process.getpgid(server_info[:process]))
          Process.waitpid(server_info[:process], Process::WNOHANG)
        rescue Errno::ESRCH, Errno::ECHILD
          # Process already terminated
        end

        # Clean up temporary directory
        FileUtils.rm_rf(server_info[:directory])
      end

      @spawned_servers.clear
    end

    # Waits for a server to be responsive on the given hostname and port
    #
    # @param hostname [String] The hostname to check
    # @param port [Integer] The port to check
    # @param timeout [Integer] Maximum time to wait in seconds
    def wait_for_server(hostname, port, timeout: DEFAULT_TIMEOUT)
      Timeout.timeout(timeout) do
        loop do
          # First check TCP connection
          TCPSocket.new(hostname, port).close

          # Then verify HTTP endpoint actually responds
          break if server_responds_to_http?(hostname, port)
        rescue Errno::ECONNREFUSED, Errno::EHOSTUNREACH
          sleep 0.2 # Slightly longer sleep for CI stability
        end
      end
    rescue Timeout::Error
      raise "Server failed to start on #{hostname}:#{port} within #{timeout} seconds"
    end

    # Checks if the server responds to HTTP requests (not just TCP connection)
    #
    # @param hostname [String] The hostname to check
    # @param port [Integer] The port to check
    # @return [Boolean] True if server responds to HTTP requests
    def server_responds_to_http?(hostname, port)
      # Try the health endpoint first
      uri = URI("http://#{hostname}:#{port}/health")
      response = Net::HTTP.get_response(uri)
      return true if response.code.to_i < 500

      # Fall back to checking the main SSR endpoint with a minimal POST
      uri = URI("http://#{hostname}:#{port}/")
      http = Net::HTTP.new(uri.host, uri.port)
      http.read_timeout = 2
      http.open_timeout = 2

      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request.body = JSON.generate({ url: "http://test.com" })

      response = http.request(request)
      response.code.to_i < 500 # Accept any non-server-error response
    rescue StandardError
      false
    end

    # Checks if a port is available for binding
    #
    # @param hostname [String] The hostname to bind to
    # @param port [Integer] The port to check
    def port_available?(hostname, port)
      server = TCPServer.new(hostname, port)
      server.close
      true
    rescue Errno::EADDRINUSE
      false
    end

    # Ensures a port is available, raising an error if not
    #
    # @param hostname [String] The hostname to bind to
    # @param port [Integer] The port to check
    def ensure_port_available!(hostname, port)
      unless port_available?(hostname, port)
        raise "Port #{port} is already in use on #{hostname}"
      end
    end
  end
end
