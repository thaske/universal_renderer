# frozen_string_literal: true

require "puma/dsl"
require "puma/plugin"
require_relative "../../universal_renderer/supervisor"

module UniversalRenderer
  # Starts and supervises the SSR renderer from Puma.
  #
  #   # config/puma.rb
  #   plugin :universal_renderer
  #   universal_renderer bundle: "ssr-build/server.mjs" # optional, after `plugin`
  #
  # Puma runs plugins in its master process, so a clustered server gets one
  # renderer, not one per worker. Each option falls back to the environment
  # variable `bin/web` reads, then to the default.
  module PumaPlugin
    LOG_PREFIX = Supervisor::LOG_PREFIX

    OPTION_DEFAULTS = {
      enabled: true,
      runtime: ["SSR_RUNTIME", "bun"],
      bundle: ["SSR_BUNDLE", "ssr-build/server.mjs"],
      port: ["SSR_PORT", "3001"],
      health_path: "/health",
      health_interval: ["SSR_HEALTH_INTERVAL", "10"],
      health_failures: ["SSR_HEALTH_FAILURES", "3"],
      stop_timeout: 10,
      on_event: nil
    }.freeze

    # Puma DSL methods. `plugin :universal_renderer` loads this file, so call
    # `universal_renderer` after that line.
    module DSL
      # @option options [Boolean] :enabled Set false to skip starting the renderer.
      # @option options [String] :runtime (`SSR_RUNTIME`, `"bun"`)
      # @option options [String] :bundle (`SSR_BUNDLE`, `"ssr-build/server.mjs"`)
      #   If it does not exist, the renderer is not started and pages render on the client.
      # @option options [String, Array<String>] :command Replaces `runtime` and `bundle`.
      # @option options [Integer] :port (`SSR_PORT`, 3001)
      # @option options [String] :health_path ("/health")
      # @option options [Numeric, false] :health_interval (`SSR_HEALTH_INTERVAL`, 10)
      #   `false`, or `SSR_WATCHDOG=0`, turns health checks off.
      # @option options [Integer] :health_failures (`SSR_HEALTH_FAILURES`, 3)
      # @option options [Numeric] :stop_timeout (10)
      # @option options [#call] :on_event Called with `(name, details)` for
      #   `:started`, `:exited`, `:unhealthy`, and `:stopped`. Runs in the Puma master.
      def universal_renderer(**options)
        @options[:universal_renderer] = options
      end
    end

    def self.resolve(options, env: ENV)
      unknown = options.keys - OPTION_DEFAULTS.keys - [:command]
      raise ArgumentError, "unknown universal_renderer option(s): #{unknown.join(', ')}" if unknown.any?

      resolved =
        OPTION_DEFAULTS.to_h do |key, default|
          value =
            if options.key?(key)
              options[key]
            elsif default.is_a?(Array)
              env.fetch(*default)
            else
              default
            end
          [key, value]
        end
      resolved[:command] = options[:command]
      resolved[:health_interval] = nil if resolved[:health_interval] == false || env["SSR_WATCHDOG"] == "0"
      resolved[:health_interval] &&= Float(resolved[:health_interval])
      resolved[:health_failures] = Integer(resolved[:health_failures])
      resolved[:port] = Integer(resolved[:port])
      resolved
    end

    def self.start(launcher)
      log_writer = launcher.log_writer
      log = ->(message) { log_writer.log(message) }
      options = resolve(launcher.options[:universal_renderer] || {})
      return log.call("#{LOG_PREFIX} disabled") unless options[:enabled]

      command = command_for(options, log)
      return unless command

      supervise(launcher, command, options, log)
    end

    def self.command_for(options, log)
      return options[:command] if options[:command]

      if File.exist?(options[:bundle])
        [options[:runtime], options[:bundle]]
      else
        log.call("#{LOG_PREFIX} #{options[:bundle]} missing, serving client-rendered pages only")
        nil
      end
    end

    def self.supervise(launcher, command, options, log)
      supervisor =
        Supervisor.new(
          command: command,
          logger: log,
          **options.slice(:port, :health_path, :health_interval, :health_failures, :stop_timeout, :on_event)
        ).start

      launcher.events.after_stopped { supervisor.stop }

      # Fires for hot and phased restarts alike, and a plugin cannot tell which.
      # A hot restart execs right after, so the supervisor's next renderer (one
      # second later) never starts and the new master boots its own. A phased
      # restart keeps this master, so the supervisor starts a renderer with the
      # new bundle. Either way the old one must release the port first.
      launcher.events.before_restart { supervisor.restart(reason: "Puma restart") }

      # `after_stopped` does not run when the master dies some other way, and the
      # renderer is in its own process group, so nothing else would stop it.
      # Workers inherit this hook when they fork, hence the pid check.
      master_pid = Process.pid
      at_exit { supervisor.stop if Process.pid == master_pid && !supervisor.stopping? }
      supervisor
    end
  end
end

Puma::DSL.include(UniversalRenderer::PumaPlugin::DSL)

Puma::Plugin.create do
  def start(launcher) # rubocop:disable Rails/Delegate -- the Puma master may not have loaded ActiveSupport
    UniversalRenderer::PumaPlugin.start(launcher)
  end
end
