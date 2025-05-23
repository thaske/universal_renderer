# frozen_string_literal: true

require "socket"
require "timeout"
require "fileutils"
require_relative "test_server_generator"

module IntegrationHelpers
  module ServerHelpers
    # Default configuration for test SSR servers
    DEFAULT_HOSTNAME = "localhost"
    DEFAULT_PORT = 9876
    DEFAULT_TIMEOUT = 10

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
      ensure_port_available!(port)

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
          TCPSocket.new(hostname, port).close
          break
        rescue Errno::ECONNREFUSED, Errno::EHOSTUNREACH
          sleep 0.1
        end
      end
    rescue Timeout::Error
      raise "Server failed to start on #{hostname}:#{port} within #{timeout} seconds"
    end

    # Checks if a port is available for binding
    #
    # @param port [Integer] The port to check
    def port_available?(port)
      server = TCPServer.new("localhost", port)
      server.close
      true
    rescue Errno::EADDRINUSE
      false
    end

    # Ensures a port is available, raising an error if not
    #
    # @param port [Integer] The port to check
    def ensure_port_available!(port)
      raise "Port #{port} is already in use" unless port_available?(port)
    end
  end
end
