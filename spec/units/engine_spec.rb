# frozen_string_literal: true

require "open3"

RSpec.describe UniversalRenderer::Engine do
  it "boots an eager-loaded API-only Rails application" do
    script = <<~RUBY
      require "rails"
      require "active_support/all"
      require "universal_renderer"
      require "action_controller/railtie"

      class ApiOnlyApplication < Rails::Application
        config.api_only = true
        config.eager_load = true
        config.secret_key_base = "test"
        config.logger = Logger.new(nil)
      end

      Rails.application = ApiOnlyApplication.new
      Rails.application.initialize!

      abort "Renderable was included in ActionController::API" if
        ActionController::API.ancestors.include?(UniversalRenderer::Renderable)

      abort "Renderable was not included in ActionController::Base" unless
        ActionController::Base.ancestors.include?(UniversalRenderer::Renderable)

      puts "api-only boot ok"
    RUBY

    stdout, stderr, status = Open3.capture3(
      RbConfig.ruby,
      "-I#{File.expand_path("../../lib", __dir__)}",
      "-e",
      script
    )

    expect(status).to be_success, stderr
    expect(stdout).to include("api-only boot ok")
  end
end
