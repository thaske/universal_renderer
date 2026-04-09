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
            body: result["body"],
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
              StdioProcess.new(
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

          raw = read_line_with_deadline
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
          terminate_child!
          @stderr_thread&.kill
        end

        private

        # Read a single newline-terminated line from @stdout, enforcing a wall-clock
        # deadline across multiple partial reads. wait_readable alone only guarantees
        # the first byte is available; a child that writes a partial line and hangs
        # would otherwise block readline indefinitely.
        def read_line_with_deadline
          deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + @timeout
          buffer = +""
          loop do
            remaining = deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
            raise Timeout::Error, "Stdio render timed out after #{@timeout}s" if remaining <= 0

            ready = @stdout.wait_readable(remaining)
            raise Timeout::Error, "Stdio render timed out after #{@timeout}s" if ready.nil?

            chunk = @stdout.read_nonblock(4096, exception: false)
            case chunk
            when :wait_readable
              next
            when nil
              raise EOFError, "Stdio child closed stdout"
            else
              buffer << chunk
              nl = buffer.index("\n")
              return buffer.byteslice(0, nl) if nl
            end
          end
        end

        def terminate_child!
          return unless @wait_thr&.alive?
          pid = @wait_thr.pid
          begin
            Process.kill("TERM", pid)
          rescue Errno::ESRCH
            return
          end
          return if @wait_thr.join(1)

          # Child ignored TERM; escalate so the pool slot doesn't leak.
          begin
            Process.kill("KILL", pid)
          rescue Errno::ESRCH
            # already gone
          end
          @wait_thr.join(1)
        end

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
end
