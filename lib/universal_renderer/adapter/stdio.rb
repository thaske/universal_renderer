# frozen_string_literal: true

require_relative "base"
require "open3"
require "json"
require "connection_pool"

module UniversalRenderer
  module Adapter
    class Stdio < Base
      def initialize
        super
        @pool_size = UniversalRenderer.config.stdio_pool_size
        @timeout = UniversalRenderer.config.stdio_timeout
        @cli_script = UniversalRenderer.config.stdio_cli_script
        @process_pool = nil
        setup
      end

      def call(url, props)
        return nil unless @process_pool

        with_process do |process|
          Rails.logger.debug do
            "Stdio rendering: #{url} with props keys: #{props.keys}"
          end

          result = process.render(url, props)
          return nil unless result.is_a?(Hash)

          UniversalRenderer::SSR::Response.new(
            head: result["head"],
            body: result["body"] || result["body_html"],
            body_attrs: result["body_attrs"] || {}
          )
        end
      rescue StandardError => e
        Rails.logger.error(
          "Stdio SSR execution failed (URL: #{url}): #{e.full_message}"
        )
        nil
      end

      def stream(_url, _props, _template, _response)
        Rails.logger.warn(
          "Stdio adapter does not support streaming SSR. Use HTTP adapter for streaming."
        )
        false
      end

      def supports_streaming?
        false
      end

      private

      def setup
        cli_script_path = Rails.root.join(@cli_script)
        unless File.exist?(cli_script_path)
          Rails.logger.error(
            "Stdio CLI script not found at #{cli_script_path}. " \
              "Please ensure the SSR CLI script is available."
          )
          return
        end

        begin
          timeout_ms = @timeout
          script = cli_script_path.to_s
          @process_pool =
            ConnectionPool.new(size: @pool_size, timeout: 5) do
              UniversalRenderer::Adapter::StdioProcess.new(
                script,
                timeout_ms: timeout_ms
              )
            end

          Rails.logger.info(
            "Universal Renderer Stdio process pool (#{@pool_size}) initialized"
          )
        rescue StandardError => e
          Rails.logger.error(
            "Failed to initialize Stdio process pool: #{e.full_message}"
          )
        end
      end

      def with_process(&)
        return unless @process_pool
        @process_pool.with(&)
      end
    end

    # Long-lived Bun process wrapper. One instance per ConnectionPool slot;
    # the pool guarantees exclusive checkout so no internal locking is needed.
    # On I/O error, timeout, or unexpected child exit, the underlying process
    # is transparently respawned so the pool slot remains usable.
    class StdioProcess
      def initialize(cli_script, timeout_ms: 5_000)
        @cli_script = cli_script
        @timeout = timeout_ms / 1000.0
        spawn!
      end

      # Render a page by url with the given props hash.
      # Returns the parsed JSON response.
      def render(url, props)
        spawn! unless alive?

        payload = JSON.generate({ url: url, props: props })
        @stdin.puts(payload)
        @stdin.flush

        ready = @stdout.wait_readable(@timeout)
        raise Timeout::Error, "Stdio render timed out after #{@timeout}s" if ready.nil?

        raw = @stdout.readline
        JSON.parse(raw)
      rescue Timeout::Error, Errno::EPIPE, IOError => e
        # IOError covers EOFError and closed-stream errors.
        close
        raise e
      end

      def alive?
        @wait_thr&.alive?
      end

      def close
        [@stdin, @stdout, @stderr].each do |io|
          io.close if io && !io.closed?
        rescue IOError
          # already closed
        end
        if @wait_thr&.alive?
          begin
            Process.kill("TERM", @wait_thr.pid)
          rescue Errno::ESRCH
            # already gone
          end
          @wait_thr.join(1)
        end
        @stderr_thread&.kill
      end

      private

      def spawn!
        close if @wait_thr
        @stdin, @stdout, @stderr, @wait_thr = Open3.popen3("bun", @cli_script)
        @stdin.sync = true
        drain_stderr!
      end

      def drain_stderr!
        stderr = @stderr
        @stderr_thread =
          Thread.new do
            stderr.each_line do |line|
              Rails.logger.warn("[stdio-ssr] #{line.chomp}")
            end
          rescue IOError
            # pipe closed
          end
        @stderr_thread.name = "universal_renderer-stdio-stderr" if @stderr_thread.respond_to?(:name=)
      end
    end
  end
end
