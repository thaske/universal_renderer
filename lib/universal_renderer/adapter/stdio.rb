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

          result = result.deep_symbolize_keys
          if result[:error].present?
            Rails.logger.error(
              "Stdio SSR render failed (URL: #{url}): #{result[:error]}"
            )
            return nil
          end

          UniversalRenderer::SSR::Response.new(
            head: result[:head],
            body: result[:body],
            body_attrs: result[:body_attrs]
          )
        end
      rescue StandardError => e
        Rails.logger.error(
          "Stdio SSR execution failed (URL: #{url}): #{e.full_message}"
        )
        nil
      end

      def stream(url, props, template, response)
        return false unless @process_pool

        chunks_written = false

        with_process do |process|
          Rails.logger.debug do
            "Stdio streaming: #{url} with props keys: #{props.keys}"
          end

          process.render_stream(url, props, template) do |chunk|
            response.stream.write(chunk)
            chunks_written = true
          end
        end

        true
      rescue StandardError => e
        Rails.logger.error(
          "Stdio SSR stream failed (URL: #{url}): #{e.full_message}"
        )

        # Once bytes have reached the response stream a fallback render would
        # append a second document to the same response, so close what we have
        # and report success. A failure before any output allows a clean
        # fallback to non-streaming rendering.
        return false unless chunks_written

        response.stream.close unless response.stream.closed?
        true
      end

      def supports_streaming?
        !@process_pool.nil?
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
            ConnectionPool.new(
              size: @pool_size,
              timeout: timeout_ms / 1000.0
            ) { StdioProcess.new(script, timeout_ms: timeout_ms) }

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
      # On I/O error, timeout, protocol desync, or unexpected child exit, the
      # underlying process is respawned so the pool slot remains usable.
      class StdioProcess # rubocop:disable Metrics/ClassLength
        # Raised when the child reports a render failure in-band via a
        # terminal `{"error": ...}` frame. The protocol stream remains
        # synchronized, so the process is not respawned.
        class RenderError < StandardError
        end

        # Raised when the child emits a frame the streaming protocol does not
        # define; the stream must be considered desynchronized.
        class ProtocolError < StandardError
        end

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
          write_line_with_deadline(payload)

          raw = read_line_with_deadline
          JSON.parse(raw)
        rescue Timeout::Error, Errno::EPIPE, IOError, JSON::ParserError => e
          # IOError covers EOFError and closed-stream errors. A parse failure
          # means the protocol stream is desynchronized (e.g. a stray stdout
          # write in the child); leftover bytes in the pipe would be served as
          # the next request's response, so the process must be replaced too.
          close
          raise e
        end

        # Stream a page render, yielding each HTML chunk as the child emits
        # it. The child answers with `{"chunk": ...}` frames terminated by
        # `{"done": true}` on success or `{"error": ...}` on failure (raised
        # as RenderError). The read deadline applies per frame, so a long
        # render survives as long as the child never goes idle past the
        # timeout.
        def render_stream(url, props, template)
          spawn! unless alive?

          payload =
            JSON.generate({ url: url, props: props, template: template })
          write_line_with_deadline(payload)

          loop do
            frame = JSON.parse(read_line_with_deadline)

            if frame.key?("error")
              raise RenderError, frame["error"]
            elsif frame.key?("chunk") || frame.key?("done")
              yield frame["chunk"] if frame["chunk"]
              return true if frame["done"]
            else
              raise ProtocolError,
                    "Unexpected stdio frame with keys: #{frame.keys.inspect}"
            end
          end
        rescue Timeout::Error,
               Errno::EPIPE,
               IOError,
               JSON::ParserError,
               ProtocolError => e
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

        # Write a newline-terminated request under the same wall-clock deadline
        # as reads. A blocking write could otherwise stall a server thread
        # indefinitely when the payload exceeds the pipe buffer and the child
        # has wedged without exiting.
        def write_line_with_deadline(payload)
          deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + @timeout
          data = "#{payload}\n"
          until data.empty?
            remaining =
              deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
            if remaining <= 0
              raise Timeout::Error, "Stdio write timed out after #{@timeout}s"
            end

            written = @stdin.write_nonblock(data, exception: false)
            if written == :wait_writable
              unless @stdin.wait_writable(remaining)
                raise Timeout::Error, "Stdio write timed out after #{@timeout}s"
              end
            else
              data = data.byteslice(written..)
            end
          end
        end

        # Read a single newline-terminated line from @stdout, enforcing a wall-clock
        # deadline across multiple partial reads. wait_readable alone only guarantees
        # the first byte is available; a child that writes a partial line and hangs
        # would otherwise block readline indefinitely.
        #
        # Bytes past the newline are kept in @read_buffer for the next call:
        # during streaming several frames routinely arrive in one pipe read.
        def read_line_with_deadline
          deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + @timeout
          loop do
            nl = @read_buffer.index("\n")
            if nl
              line = @read_buffer.byteslice(0, nl)
              @read_buffer = @read_buffer.byteslice((nl + 1)..)
              return line
            end

            remaining =
              deadline - Process.clock_gettime(Process::CLOCK_MONOTONIC)
            if remaining <= 0
              raise Timeout::Error, "Stdio render timed out after #{@timeout}s"
            end

            ready = @stdout.wait_readable(remaining)
            if ready.nil?
              raise Timeout::Error, "Stdio render timed out after #{@timeout}s"
            end

            chunk = @stdout.read_nonblock(4096, exception: false)
            case chunk
            when :wait_readable
              next
            when nil
              raise EOFError, "Stdio child closed stdout"
            else
              @read_buffer << chunk
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
          # Binary so String#index positions match byteslice offsets; chunks
          # from read_nonblock arrive as ASCII-8BIT anyway.
          @read_buffer = String.new(encoding: Encoding::BINARY)
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
          @stderr_thread.name =
            "universal_renderer-stdio-stderr" if @stderr_thread.respond_to?(
            :name=
          )
        end
      end
    end
  end
end
