require "universal_renderer/version"
require "universal_renderer/engine"
require "universal_renderer/configuration"

require "universal_renderer/renderable"

require "universal_renderer/ssr/response"

require "universal_renderer/client/base"
require "universal_renderer/client/stream"

require "universal_renderer/ssr/helpers"
require "universal_renderer/ssr/placeholders"
require "universal_renderer/ssr/scrubber"

module UniversalRenderer
  class << self
    attr_writer :config

    def config
      @config ||= Configuration.new
    end

    def configure
      yield(config)
    end

    # Configurable logger for the gem. Defaults to the host application's
    # Rails.logger (when Rails is loaded) wrapped in
    # ActiveSupport::TaggedLogging so every line is prefixed with
    # [UniversalRenderer]. Host apps can replace it via
    # UniversalRenderer.logger = MyLogger.new.
    def logger
      @logger || default_logger
    end

    def logger=(logger)
      @logger =
        logger.nil? ? nil : ActiveSupport::TaggedLogging.new(logger)
    end

    # Tags every block of log output with the gem name so host app logs stay
    # distinguishable without callers having to remember a prefix. Yields the
    # tagged logger for convenient use:
    #   UniversalRenderer.log { |log| log.error("...") }
    def log
      logger.tagged("UniversalRenderer") { yield logger }
    end

    private

    def default_logger
      base =
        if defined?(Rails) && Rails.respond_to?(:logger) && Rails.logger
          Rails.logger
        else
          ActiveSupport::Logger.new($stdout)
        end
      ActiveSupport::TaggedLogging.new(base)
    end
  end
end
