# frozen_string_literal: true

require "net/http"

module UniversalRenderer
  # Runs the SSR renderer as a child process and keeps it running. Used by the
  # Puma plugin; not public API.
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
    HEALTH_PATH = "/health"
    EXIT_POLL_INTERVAL = 0.2
    # A renderer that keeps dying waits 1, 2, 4 ... up to this many seconds.
    MAX_BACKOFF = 30
    # A renderer that ran this long was healthy, so its next restart waits 1s again.
    HEALTHY_AFTER = 60

    attr_reader :pid

    # @param command [Array<String>] Renderer command line, run without a shell.
    # @param port [Integer] Passed to the renderer as `SSR_PORT`, and used for health checks.
    # @param health_interval [Numeric, nil] Seconds between health checks; `nil` turns them off.
    # @param health_failures [Integer] Failed checks in a row before a restart.
    # @param stop_timeout [Numeric] Seconds to wait after `TERM` before `KILL`.
    def initialize(command:, port:, # rubocop:disable Metrics/ParameterLists -- the timings exist for tests
                   env: {}, health_interval: 10, health_failures: 3, stop_timeout: 10,
                   logger: ->(message) { warn(message) })
      @command = command
      @port = Integer(port)
      @env = env.merge("SSR_PORT" => @port.to_s)
      @health_interval = health_interval
      @health_failures = health_failures
      @stop_timeout = stop_timeout
      @logger = logger

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
      outside_trap { terminate(pid, reason) }
    end

    # Stops the renderer for good and waits for it to exit.
    def stop
      outside_trap do
        # No renderer starts after this, so the one terminated below is the last.
        @mutex.synchronize { @stopping = true }
        @wakeup.close
        terminate(pid, "stopping")
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

        # Backing off is for a renderer that keeps dying, not one we replaced.
        backoff = 1 if planned || monotonic_now - started_at >= HEALTHY_AFTER
        log("#{describe_exit(pid, status)}, restarting in #{backoff}s")
        sleep_unless_stopped(backoff)
        backoff = [backoff * 2, MAX_BACKOFF].min
      end
    rescue StandardError => e
      log("supervisor stopped unexpectedly: #{e.class}: #{e.message}")
    end

    # Spawns under the lock that `stop` takes, so a renderer cannot start after
    # `stop` has looked for the one to terminate.
    def spawn_renderer
      pid =
        @mutex.synchronize do
          next if @stopping

          @pid = Process.spawn(@env, *@command, pgroup: true)
        end
      log("renderer started (pid=#{pid}, port=#{@port})") if pid
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
        if current_pid != watched_pid
          watched_pid = current_pid
          strikes = 0
        end
        next if current_pid.nil?

        if healthy?
          strikes = 0
          next
        end

        strikes += 1
        next if strikes < @health_failures

        # A failure, not a planned restart: a renderer that keeps wedging backs off.
        terminate(current_pid, "failed #{strikes} health checks", planned: false)
        strikes = 0
      end
    rescue StandardError => e
      log("health checks stopped unexpectedly: #{e.class}: #{e.message}")
    end

    def healthy?
      Net::HTTP.start("127.0.0.1", @port, open_timeout: 1, read_timeout: 5) do |http|
        http.get(HEALTH_PATH).is_a?(Net::HTTPSuccess)
      end
    rescue StandardError
      false
    end

    # Acts only while `target` is still the running renderer: a health check can
    # take seconds, and the renderer it judged may have been replaced meanwhile.
    # A planned exit restarts after one second instead of continuing the backoff.
    def terminate(target, reason, planned: true)
      current =
        @mutex.synchronize do
          next false unless target && @pid == target

          @planned_exits << target if planned
          true
        end
      return unless current

      log("stopping renderer pid=#{target} (#{reason})")
      signal(target, "TERM")
      return if wait_for_exit(target, @stop_timeout)

      log("renderer pid=#{target} did not exit within #{@stop_timeout}s, killing it")
      signal(target, "KILL")
      wait_for_exit(target, 2)
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

    def log(message)
      @logger.call("#{LOG_PREFIX} #{message}")
    end

    def monotonic_now
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end
  end
end
