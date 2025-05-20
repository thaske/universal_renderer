require "universal_renderer/version"
require "universal_renderer/engine"
require "universal_renderer/configuration"
require "universal_renderer/ssr_scrubber"
require "universal_renderer/client"
require "universal_renderer/stream_client"
require "universal_renderer/rendering"
require "universal_renderer/ssr_helpers"

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
