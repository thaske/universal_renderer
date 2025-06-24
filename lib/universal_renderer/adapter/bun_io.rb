# frozen_string_literal: true

require_relative "base"
require "open3"
require "json"
require "connection_pool"

module UniversalRenderer
  module Adapter
    class BunIo < Base
      def initialize
        @pool_size = UniversalRenderer.config.bun_pool_size
        @timeout = UniversalRenderer.config.bun_timeout
        @cli_script = UniversalRenderer.config.bun_cli_script
        @process_pool = nil
        setup
      end

      def call(url, props)
        return nil unless @process_pool

        begin
          with_process do |process|
            payload = { url:, props: }

            Rails.logger.info(
              "BunIo rendering: #{payload[:url]} with props keys: #{payload[:props].keys}",
            )

            result = process.render(payload[:url], payload[:props])

            # Convert result to SSR::Response format
            # Assuming Bun process returns HTML string, we need to parse or structure it
            return nil unless result.is_a?(Hash)

            # The Bun process should return JSON with head, body, and body_attrs
            # This matches the same format as the HTTP adapter expects
            UniversalRenderer::SSR::Response.new(
              head: result["head"] || result[:head],
              body:
                result["body"] || result[:body] || result["body_html"] ||
                  result[:body_html],
              body_attrs: result["body_attrs"] || result[:body_attrs] || {},
            )
          end
        rescue StandardError => e
          Rails.logger.error(
            "BunIo SSR execution failed: #{e.class.name} - #{e.message} (URL: #{url}) - #{e.backtrace.join("\n")}",
          )
          nil
        end
      end

      def stream(_url, _props, _template, _response)
        # Streaming is not supported with stdio Bun processes via stdin/stdout
        Rails.logger.warn(
          "BunIo adapter does not support streaming SSR. Use HTTP adapter for streaming.",
        )
        false
      end

      def supports_streaming?
        false
      end

      private

      def setup
        # Check if the CLI script exists
        cli_script_path = Rails.root.join(@cli_script)
        unless File.exist?(cli_script_path)
          Rails.logger.error(
            "BunIo CLI script not found at #{cli_script_path}. " \
              "Please ensure the Bun CLI script is available.",
          )
          return
        end

        begin
          @process_pool =
            ConnectionPool.new(size: @pool_size, timeout: 5) do
              UniversalRenderer::StdioBunProcess.new(@cli_script)
            end

          Rails.logger.info(
            "Universal Renderer BunIo process pool (#{@pool_size}) initialized",
          )
        rescue StandardError => e
          Rails.logger.error(
            "Failed to initialize BunIo process pool: " \
              "#{e.class.name} - #{e.message} - #{e.backtrace.join("\n")}",
          )
        end
      end

      def with_process(&)
        return unless @process_pool
        @process_pool.with(&)
      end
    end
  end

  # Stdio Bun process wrapper
  class StdioBunProcess
    def initialize(cli_script)
      @stdin, @stdout, @stderr, @wait_thr = Open3.popen3("bun", cli_script)
      @mutex = Mutex.new
    end

    # Render a component by name with the given props hash.
    # Returns the JSON response with head, body, and body_attrs from the Bun runtime.
    def render(url, props)
      payload = JSON.generate({ url:, props: })
      @mutex.synchronize do
        @stdin.puts(payload)
        @stdin.flush
        raw = @stdout.readline
        parsed = JSON.parse(raw)
        return parsed
      end
    end

    def alive?
      @wait_thr&.alive?
    end

    def close
      @stdin.close unless @stdin.closed?
      @stdout.close unless @stdout.closed?
      @stderr.close unless @stderr.closed?
      Process.kill("TERM", @wait_thr.pid) if alive?
    rescue Errno::ESRCH, IOError
      # Process already gone / closed
    end
  end
end
