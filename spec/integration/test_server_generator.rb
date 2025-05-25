# frozen_string_literal: true

require "json"
require "fileutils"
require "tmpdir"

module IntegrationHelpers
  # Service class responsible for generating test SSR server files and configuration
  class TestServerGenerator
    # Gets the project root directory
    def self.project_root
      @project_root ||= File.expand_path("../..", __dir__)
    end

    # Creates a temporary directory for the test server
    def self.create_directory
      Dir.mktmpdir("ssr_test_server_")
    end

    # Writes the necessary files for a test SSR server
    def self.write_files(server_dir, port:, hostname:, **config)
      write_package_json(server_dir)
      write_server_file(server_dir, port: port, hostname: hostname, **config)
      install_dependencies(server_dir)
    end

    # Writes package.json with correct path to universal-renderer
    def self.write_package_json(server_dir)
      universal_renderer_path = File.join(project_root, "universal-renderer")

      package_json = {
        "name" => "ssr-test-server",
        "version" => "1.0.0",
        "type" => "module",
        "dependencies" => {
          "universal-renderer" => "file:#{universal_renderer_path}",
          "react" => "^19.1.0",
          "react-dom" => "^19.1.0"
        }
      }

      File.write(
        File.join(server_dir, "package.json"),
        JSON.pretty_generate(package_json)
      )
    end

    # Creates the server.ts file
    def self.write_server_file(server_dir, port:, hostname:, **_config)
      server_content = generate_server_content(port: port, hostname: hostname)
      File.write(File.join(server_dir, "server.ts"), server_content)
    end

    # Generates the TypeScript content for the test server
    def self.generate_server_content(port:, hostname:, **_config)
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
        const app = await createServer({
          hostname: '#{hostname}',
          port: #{port},
          ...callbacks,
          streamCallbacks: streamCallbacks
        });

        const server = app.listen(#{port}, '#{hostname}', () => {
          console.log(`Test SSR server started on http://#{hostname}:#{port}`);
        });

        // Handle shutdown gracefully
        process.on('SIGTERM', () => {
          console.log('Shutting down test server...');
          server.close();
          process.exit(0);
        });
      TYPESCRIPT
    end

    # Installs NPM dependencies in the server directory
    def self.install_dependencies(server_dir)
      result =
        system(
          "bun",
          "install",
          chdir: server_dir,
          out: File::NULL,
          err: %i[child out]
        )

      return if result

      error_output = `cd #{server_dir} && bun install 2>&1`
      raise "Failed to install dependencies for test server in #{server_dir}. Error: #{error_output}"
    end
  end
end
