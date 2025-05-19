module UniversalRenderer
  class InstallGenerator < Rails::Generators::Base
    source_root File.expand_path("templates", __dir__)

    def copy_initializer
      template "initializer.rb", "config/initializers/universal_renderer.rb"
    end

    def include_concern
      application_controller = "app/controllers/application_controller.rb"

      inject_into_class application_controller,
                        "ApplicationController",
                        "  include UniversalRenderer::Rendering\n"
    end
  end
end
