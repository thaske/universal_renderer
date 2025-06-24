module UniversalRenderer
  class InstallGenerator < Rails::Generators::Base
    source_root File.expand_path("templates", __dir__)

    def copy_initializer
      template "initializer.rb", "config/initializers/universal_renderer.rb"
    end

    def show_installation_notes
      say_status "info", "Universal Renderer installed successfully!"
      say_status "note", "To use BunIo (stdio Bun processes):"
      say_status "", "  1. Set config.engine = :bun_io in your initializer"
      say_status "",
                 "  2. Create a stdio CLI script (e.g., app/frontend/ssr/ssr.ts)"
      say_status "",
                 "  3. Configure the CLI script path if using a custom location"
      say_status "", "  4. Ensure Bun is installed and accessible"
      say_status "note", "To use HTTP server (external Node.js/Bun):"
      say_status "", "  1. Keep config.engine = :http (default)"
      say_status "", "  2. Set SSR_SERVER_URL environment variable"
    end
  end
end
