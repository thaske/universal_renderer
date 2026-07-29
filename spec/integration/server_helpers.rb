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
    DEFAULT_TIMEOUT = ENV["CI"] ? 60 : 20 # Longer timeout in CI environments

    # Spawns a real SSR server process using Bun and the universal-renderer workspace package
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
      config = config.dup

      server_dir = HttpExpressServerGenerator.create_directory
      process = nil

      begin
        HttpExpressServerGenerator.write_files(
          server_dir,
          port: port,
          hostname: hostname,
          **config
        )

        process =
          Process.spawn(
            { "NODE_ENV" => "test" },
            "bun",
            "server.mjs",
            chdir: server_dir,
            out: config[:verbose] || !ENV["CI"] ? $stdout : File::NULL,
            err: config[:verbose] || !ENV["CI"] ? $stderr : File::NULL,
            pgroup: true
          )

        wait_for_server(hostname, port)
        ServerHelpers.spawned_servers << {
          process: process,
          directory: server_dir
        }
        process
      rescue StandardError
        terminate_server(process) if process
        FileUtils.rm_rf(server_dir)
        raise
      end
    end

    def self.spawned_servers
      @spawned_servers ||= []
    end

    # Stops all spawned SSR servers and cleans up resources. The registry is
    # module-scoped because RSpec runs before(:all), examples, and after(:all)
    # on different object instances.
    def cleanup_ssr_servers
      ServerHelpers.spawned_servers.each do |server_info|
        terminate_server(server_info[:process])
      ensure
        FileUtils.rm_rf(server_info[:directory])
      end
    ensure
      ServerHelpers.spawned_servers.clear
    end

    def terminate_server(process)
      process_group = Process.getpgid(process)
      Process.kill("TERM", -process_group)

      Timeout.timeout(5) { Process.waitpid(process) }
    rescue Timeout::Error
      force_terminate_server(process, process_group)
    rescue Errno::ESRCH, Errno::ECHILD
      # Process already terminated and reaped.
    end

    def force_terminate_server(process, process_group)
      Process.kill("KILL", -process_group)
      Process.waitpid(process)
    rescue Errno::ESRCH, Errno::ECHILD
      # Process exited between the timeout and forced termination.
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
          sleep 0.5 # Slightly longer sleep for CI stability
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
      return if port_available?(hostname, port)

      raise "Port #{port} is already in use on #{hostname}"
    end
  end
end
