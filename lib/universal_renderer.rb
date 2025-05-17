require 'universal_renderer/version'
require 'universal_renderer/engine'
require 'universal_renderer/configuration'

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
