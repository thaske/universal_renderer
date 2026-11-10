# frozen_string_literal: true

require "puma/dsl"
require "puma/plugin"
require_relative "../../universal_renderer/supervisor"

module UniversalRenderer
  # Starts and supervises the SSR renderer from Puma.
  #
  #   # config/puma.rb
  #   plugin :universal_renderer
  #   universal_renderer port: 3001 # optional, after `plugin`
  #
  # Puma runs plugins in its master process, so a clustered server gets one
  # renderer, not one per worker.
  module PumaPlugin
    LOG_PREFIX = Supervisor::LOG_PREFIX

    # Each option falls back to an environment variable, then to the default.
    OPTION_DEFAULTS = {
      runtime: ["SSR_RUNTIME", "bun"],
      bundle: ["SSR_BUNDLE", "ssr-build/server.mjs"],
      port: ["SSR_PORT", "3001"]
    }.freeze

    # Puma DSL methods. `plugin :universal_renderer` loads this file, so call
    # `universal_renderer` after that line.
    module DSL
      # @option options [String] :runtime (`SSR_RUNTIME`, `"bun"`)
      # @option options [String] :bundle (`SSR_BUNDLE`, `"ssr-build/server.mjs"`)
      #   When it does not exist, the renderer is not started and pages render
      #   on the client.
      # @option options [Integer] :port (`SSR_PORT`, 3001)
      def universal_renderer(**options)
        @options[:universal_renderer] = options
      end
    end

    def self.resolve(options, env: ENV)
      unknown = options.keys - OPTION_DEFAULTS.keys
      raise ArgumentError, "unknown universal_renderer option(s): #{unknown.join(', ')}" if unknown.any?

      resolved =
        OPTION_DEFAULTS.to_h do |key, (variable, default)|
          [key, options.fetch(key) { env.fetch(variable, default) }]
        end
      resolved[:port] = Integer(resolved[:port])
      resolved
    end

    def self.start(launcher)
      log_writer = launcher.log_writer
      log = ->(message) { log_writer.log(message) }
      options = resolve(launcher.options[:universal_renderer] || {})

      unless File.exist?(options[:bundle])
        return log.call("#{LOG_PREFIX} #{options[:bundle]} missing, serving client-rendered pages only")
      end

      command = [options[:runtime], options[:bundle]]
      supervise(launcher, Supervisor.new(command: command, port: options[:port], logger: log))
    end

    def self.supervise(launcher, supervisor)
      supervisor.start
      on(launcher.events, :after_stopped, :on_stopped) { supervisor.stop }

      # Fires for hot and phased restarts alike, and a plugin cannot tell which.
      # A hot restart execs right after, so the supervisor's next renderer (one
      # second later) never starts and the new master boots its own. A phased
      # restart keeps this master, so the supervisor starts a renderer with the
      # new bundle. Either way the old one must release the port first.
      on(launcher.events, :before_restart, :on_restart) { supervisor.restart(reason: "Puma restart") }

      # `after_stopped` does not run when the master dies some other way, and the
      # renderer is in its own process group, so nothing else would stop it.
      # Workers inherit this hook when they fork, hence the pid check.
      master_pid = Process.pid
      at_exit { supervisor.stop if Process.pid == master_pid && !supervisor.stopping? }
      supervisor
    end

    # Puma 7 renamed its lifecycle hooks (`on_stopped` became `after_stopped`).
    # Old Pumas without either still stop the renderer through `at_exit`.
    def self.on(events, *names, &)
      name = names.find { |candidate| events.respond_to?(candidate) }
      events.public_send(name, &) if name
    end
  end
end

Puma::DSL.include(UniversalRenderer::PumaPlugin::DSL)

Puma::Plugin.create do
  def start(launcher) # rubocop:disable Rails/Delegate -- the Puma master may not have loaded ActiveSupport
    UniversalRenderer::PumaPlugin.start(launcher)
  end
end
