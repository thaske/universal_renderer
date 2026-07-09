# frozen_string_literal: true

module UniversalRenderer
  class InstallGenerator < Rails::Generators::Base
    source_root File.expand_path("templates", __dir__)

    def copy_initializer
      template "initializer.rb", "config/initializers/universal_renderer.rb"
    end

    def show_installation_notes
      say_status "info", "Universal Renderer installed successfully!"
      say_status "note", "Next steps:"
      say_status "",
                 "  1. Edit config/initializers/universal_renderer.rb to point at your SSR server"
      say_status "", "  2. Ensure your Node.js/Bun SSR server is running"
    end
  end
end
