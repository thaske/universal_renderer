module UniversalRenderer
  class InstallGenerator < Rails::Generators::Base
    source_root File.expand_path("templates", __dir__)

    def copy_initializer
      template "initializer.rb", "config/initializers/universal_renderer.rb"
    end

    def copy_ssr_bundle
      # Copy the SSR bundle template
      template "ssr_bundle/ssr_bundle.js",
               "app/assets/javascripts/universal_renderer/ssr_bundle.js"

      # Note: The fast-text-encoding polyfill is loaded automatically by the MiniRacer adapter
      # from the universal_renderer gem's vendor/fast-text-encoding submodule

      say "Created SSR bundle template at app/assets/javascripts/universal_renderer/"
    end

    def show_installation_notes
      say_status "info", "Universal Renderer installed successfully!"
      say_status "note", "To use MiniRacer (in-process JavaScript):"
      say_status "", "  1. Set config.engine = :mini_racer in your initializer"
      say_status "",
                 "  2. Optionally configure config.bundle_path if using a custom path"
      say_status "",
                 "  3. Customize your SSR bundle to include your React components"
      say_status "", "  4. Bundle your React components into that file"
      say_status "note", "To use HTTP server (external Node.js/Bun):"
      say_status "", "  1. Keep config.engine = :http (default)"
      say_status "", "  2. Set SSR_SERVER_URL environment variable"
    end
  end
end
