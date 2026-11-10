# frozen_string_literal: true

require "net/http"
require "shellwords"

module UniversalRenderer
  # Runs the SSR renderer as a child process and keeps it running.
  #
  # The renderer must not take the app server down with it: when it is gone,
  # Rails falls back to client rendering, a degraded page rather than an outage.
  # Nothing else notices that either, so this restarts it when it exits, and
  # when it is alive but stops answering its health endpoint (a render that never
  # settles holds its concurrency slot forever, see "Render timeout and health").
  #
  # Plain Ruby with no Rails dependency: the Puma plugin runs it in the Puma
  # master, which may not have loaded the app.
  class Supervisor # rubocop:disable Metrics/ClassLength -- one process lifecycle; the threads share its state
    LOG_PREFIX = "[universal_renderer]"
    EXIT_POLL_INTERVAL = 0.2

    attr_reader :pid

    # @param command [String, Array<String>] Renderer command line. A String is
    #   split with Shellwords and run without a shell.
    # @param port [Integer] Passed to the renderer as `SSR_PORT`, and used for health checks.
    # @param health_interval [Numeric, nil] Seconds between health checks. `nil`
    #   disables them; exits are still restarted.
    # @param health_failures [Integer] Consecutive failed checks before a restart.
    # @param stop_timeout [Numeric] Seconds to wait after `TERM` before `KILL`.
    # @param max_backoff [Numeric] Cap on the delay between restarts of a renderer
    #   that keeps exiting.
    # @param healthy_after [Numeric] A renderer that ran this long restarts after
    #   one second again, instead of continuing the backoff.
    # @param logger [#call] Receives each log line.
    # @param on_event [#call, nil] Called with `(name, details)` for `:started`,
    #   `:exited`, `:unhealthy`, and `:stopped`. Errors it raises are logged.
    def initialize( # rubocop:disable Metrics/ParameterLists -- each keyword is a documented option
      command:,
      port:,
      env: {},
      health_path: "/health",
      health_interval: 10,
      health_failures: 3,
      stop_timeout: 10,
      max_backoff: 30,
      healthy_after: 60,
      logger: ->(message) { warn(message) },
      on_event: nil
    )
      @command = command.is_a?(Array) ? command : Shellwords.split(command)
      @port = Integer(port)
      @env = env.merge("SSR_PORT" => @port.to_s)
      @health_path = health_path
      @health_interval = health_interval
      @health_failures = health_failures
      @stop_timeout = stop_timeout
      @max_backoff = max_backoff
      @healthy_after = healthy_after
      @logger = logger
      @on_event = on_event

      @mutex = Mutex.new
      @exited = ConditionVariable.new
      # Closing it wakes every interruptible sleep at once, for `stop`.
      @wakeup = Queue.new
      @stopping = false
      @planned_exits = Set.new
    end

    def start
      @supervisor_thread = Thread.new { supervise }
      @health_thread = Thread.new { watch_health } if @health_interval
      self
    end

    # Replaces the running renderer. Waits for it to exit, so its port is free
    # when this returns; the supervisor starts the next one after one second.
    def restart(reason:)
      outside_trap { terminate(reason) }
    end

    # Stops the renderer for good and waits for it to exit.
    def stop
      outside_trap do
        @mutex.synchronize { @stopping = true }
        @wakeup.close
        terminate("stopping")
        @supervisor_thread&.join(@stop_timeout)
        @health_thread&.join(1)
      end
    end

    def stopping?
      @mutex.synchronize { @stopping }
    end

    private

    def supervise
      backoff = 1

      until stopping?
        started_at = monotonic_now
        pid = spawn_renderer
        status = pid && wait_for_renderer(pid)
        planned =
          @mutex.synchronize do
            @pid = nil
            @exited.broadcast
            @planned_exits.delete?(pid)
          end
        break if stopping?

        emit(:exited, pid: pid, status: status&.to_s)
        # Backing off is for a renderer that keeps dying, not one we replaced.
        backoff = 1 if planned || monotonic_now - started_at >= @healthy_after
        log("#{describe_exit(pid, status)}, restarting in #{backoff}s")
        sleep_unless_stopped(backoff)
        backoff = [backoff * 2, @max_backoff].min
      end
    rescue StandardError => e
      log("supervisor stopped unexpectedly: #{e.class}: #{e.message}")
    end

    def spawn_renderer
      pid = Process.spawn(@env, *@command, pgroup: true)
      @mutex.synchronize { @pid = pid }
      log("renderer started (pid=#{pid}, port=#{@port})")
      emit(:started, pid: pid)
      pid
    rescue SystemCallError => e
      log("could not start #{@command.first}: #{e.message}")
      nil
    end

    # Polls instead of blocking in `wait2`: a clustered Puma master reaps every
    # child with `Process.wait2(-1)`, so it may collect the renderer's status first.
    def wait_for_renderer(target)
      loop do
        _, status = Process.wait2(target, Process::WNOHANG)
        return status if status

        sleep(EXIT_POLL_INTERVAL)
      end
    rescue Errno::ECHILD
      nil
    end

    def describe_exit(target, status)
      return "renderer failed to start" unless target
      return "renderer pid=#{target} exited (reaped by the app server)" unless status

      "renderer pid=#{target} exited (#{status})"
    end

    # A renderer can be alive and still useless: a wedged render, a blocked event
    # loop. Waiting for it to exit would wait forever, so replace it.
    def watch_health
      strikes = 0
      watched_pid = nil

      until stopping?
        sleep_unless_stopped(@health_interval)
        current_pid = pid
        if current_pid.nil? || current_pid != watched_pid
          watched_pid = current_pid
          strikes = 0
          next if current_pid.nil?
        end

        if healthy?
          strikes = 0
          next
        end

        strikes += 1
        next if strikes < @health_failures || stopping?

        emit(:unhealthy, pid: current_pid, failures: strikes)
        terminate("failed #{strikes} health checks")
        strikes = 0
      end
    rescue StandardError => e
      log("health checks stopped unexpectedly: #{e.class}: #{e.message}")
    end

    def healthy?
      Net::HTTP.start("127.0.0.1", @port, open_timeout: 1, read_timeout: 5) do |http|
        http.get(@health_path).is_a?(Net::HTTPSuccess)
      end
    rescue StandardError
      false
    end

    def terminate(reason)
      target = pid
      return unless target

      log("stopping renderer pid=#{target} (#{reason})")
      @mutex.synchronize { @planned_exits << target }
      signal(target, "TERM")
      unless wait_for_exit(target, @stop_timeout)
        log("renderer pid=#{target} did not exit within #{@stop_timeout}s, killing it")
        signal(target, "KILL")
        wait_for_exit(target, 2)
      end
      emit(:stopped, pid: target, reason: reason)
    end

    # The renderer runs in its own process group, so this also reaches anything
    # it started (a wrapper script, a `node` behind `npx`).
    def signal(target, name)
      Process.kill(name, -target)
    rescue Errno::ESRCH, Errno::EPERM
      nil
    end

    def wait_for_exit(target, timeout)
      deadline = monotonic_now + timeout
      @mutex.synchronize do
        while @pid == target
          remaining = deadline - monotonic_now
          return false if remaining <= 0

          @exited.wait(@mutex, remaining)
        end
      end
      true
    end

    # Puma runs some lifecycle hooks inside its signal handlers, where
    # `Mutex#synchronize` raises ThreadError. A new thread is not in trap context.
    def outside_trap(&)
      Thread.new(&).join
    end

    def sleep_unless_stopped(seconds)
      @wakeup.pop(timeout: seconds)
    end

    def emit(name, **details)
      @on_event&.call(name, details)
    rescue StandardError => e
      log("on_event raised #{e.class}: #{e.message}")
    end

    def log(message)
      @logger.call("#{LOG_PREFIX} #{message}")
    end

    def monotonic_now
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end
  end
end
