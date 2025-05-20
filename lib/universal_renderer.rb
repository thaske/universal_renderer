require "universal_renderer/version"
require "universal_renderer/engine"
require "universal_renderer/configuration"
require "universal_renderer/ssr/scrubber"
require "universal_renderer/client/base"
require "universal_renderer/client/stream"
require "universal_renderer/rendering"
require "universal_renderer/ssr/helpers"

module UniversalRenderer
  class << self
    attr_writer :config

    def config
      @config ||= Configuration.new
    end

    def configure
      yield(config)
    end
  end
end
