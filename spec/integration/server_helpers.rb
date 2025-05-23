# frozen_string_literal: true

require "socket"
require "timeout"
require "fileutils"
require "tmpdir"

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
      server_dir = create_test_server_directory

      # Write the test server configuration
      write_test_server_files(
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
          out: config[:verbose] ? STDOUT : File::NULL,
          err: config[:verbose] ? STDERR : File::NULL,
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
        if Dir.exist?(server_info[:directory])
          FileUtils.rm_rf(server_info[:directory])
        end
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
          begin
            TCPSocket.new(hostname, port).close
            break
          rescue Errno::ECONNREFUSED, Errno::EHOSTUNREACH
            sleep 0.1
          end
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

    private

    # Creates a temporary directory for the test server
    def create_test_server_directory
      Dir.mktmpdir("ssr_test_server_")
    end

    # Writes the necessary files for a test SSR server
    def write_test_server_files(server_dir, port:, hostname:, **config)
      # Create package.json with correct path to universal-renderer
      universal_renderer_path = File.join(project_root, "universal-renderer")

      package_json = {
        "name" => "ssr-test-server",
        "version" => "1.0.0",
        "type" => "module",
        "dependencies" => {
          "universal-renderer" => "file:#{universal_renderer_path}",
          "react" => "^18.2.0",
          "react-dom" => "^18.2.0"
        }
      }

      File.write(
        File.join(server_dir, "package.json"),
        JSON.pretty_generate(package_json)
      )

      # Create the server.ts file
      server_content =
        generate_test_server_content(port: port, hostname: hostname, **config)
      File.write(File.join(server_dir, "server.ts"), server_content)

      # Install dependencies
      install_dependencies(server_dir)
    end

    # Gets the project root directory
    def project_root
      @project_root ||= File.expand_path("../..", __dir__)
    end

    # Generates the TypeScript content for the test server
    def generate_test_server_content(port:, hostname:, **config)
      <<~TYPESCRIPT
        import { createServer } from 'universal-renderer';
        import React from 'react';

        // Test callbacks for integration testing
        const callbacks = {
          setup: async (url: string, props: any) => {
            return {
              url,
              props,
              timestamp: new Date().toISOString()
            };
          },
          render: async (context: any) => {
            return {
              head: '<meta name="test" content="true">',
              body: '<div>Test Content</div>'
            };
          },
          cleanup: async (context: any) => {
            // cleanup
          }
        };

        const streamCallbacks = {
          app: (context: any) => React.createElement('div', null, 'Streaming Test Content'),
          head: async (context: any) => '<meta name="stream-test" content="true">'
        };

        // Create and start the server
        const server = await createServer({
          hostname: '#{hostname}',
          port: #{port},
          ...callbacks,
          streamCallbacks: streamCallbacks
        });

        console.log(`Test SSR server started on http://#{hostname}:#{port}`);

        // Handle shutdown gracefully
        process.on('SIGTERM', () => {
          console.log('Shutting down test server...');
          server.stop();
          process.exit(0);
        });
      TYPESCRIPT
    end

    # Installs NPM dependencies in the server directory
    def install_dependencies(server_dir)
      # Capture both stdout and stderr for better error reporting
      result =
        system(
          "bun",
          "install",
          chdir: server_dir,
          out: File::NULL,
          err: %i[child out]
        )

      unless result
        # Try to get more detailed error information
        error_output = `cd #{server_dir} && bun install 2>&1`
        raise "Failed to install dependencies for test server in #{server_dir}. Error: #{error_output}"
      end
    end
  end
end
