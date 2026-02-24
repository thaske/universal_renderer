module UniversalRenderer
  class InstallGenerator < Rails::Generators::Base
    source_root File.expand_path("templates", __dir__)

    def copy_initializer
      template "initializer.rb", "config/initializers/universal_renderer.rb"
    end

    def show_installation_notes
      say_status "info", "Universal Renderer installed successfully!"
      say_status "note", "To use stdio (process pool):"
      say_status "", "  1. Set config.engine = :stdio in your initializer"
      say_status "",
                 "  2. Create a stdio CLI script (e.g., app/frontend/ssr/ssr.ts)"
      say_status "",
                 "  3. Configure the CLI script path if using a custom location"
      say_status "", "  4. Ensure Node.js is installed and accessible"
      say_status "note", "To use HTTP server (external Node.js):"
      say_status "", "  1. Keep config.engine = :http (default)"
      say_status "", "  2. Set SSR_SERVER_URL environment variable"
      say_status "note", "To auto-select by Rails env:"
      say_status "", "  1. Set config.engine = :auto"
      say_status "",
                 "  2. Configure config.engine_by_env (default: dev/test :http, production :stdio)"
    end
  end
end
