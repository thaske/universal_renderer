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
  end
end
