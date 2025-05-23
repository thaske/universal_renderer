# frozen_string_literal: true

require "spec_helper"

# Set up a minimal Rails environment for testing
ENV["RAILS_ENV"] ||= "test"

begin
  require "rails"
  require "action_controller"
  require "action_view"
rescue LoadError
  # If Rails is not available, we'll skip Rails-specific tests
  puts "Rails not available, skipping Rails-specific tests"
end

# Only load the engine if Rails is available
if defined?(Rails)
  require "universal_renderer"

  # Create a minimal Rails application for testing
  class TestApplication < Rails::Application
    config.eager_load = false
    config.cache_classes = true
    config.secret_key_base = "test"
    config.logger = Logger.new(nil)
  end

  Rails.application = TestApplication.new
  Rails.application.initialize!
else
  # Mock Rails for non-Rails tests
  module Rails
    def self.const_missing(name)
      case name
      when :Engine
        Class.new
      else
        super
      end
    end
  end

  module ActiveSupport
    def self.on_load(*)
      # No-op for testing without Rails
    end
  end
end

RSpec.configure do |config|
  # Rails-specific configuration can go here
  if defined?(Rails)
    config.before(:each) do
      # Reset any Rails state if needed
    end
  end
end
