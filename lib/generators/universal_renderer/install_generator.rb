# frozen_string_literal: true

module UniversalRenderer
  # Scaffolds a working SSR setup: the initializer, the two renderer entry points,
  # the SSR Vite build, the precompile hook, and the web-dyno launcher. Each file
  # encodes something that is wrong by default and fails silently.
  class InstallGenerator < Rails::Generators::Base
    source_root File.expand_path("templates", __dir__)

    class_option :frontend_dir,
                 type: :string,
                 default: "app/frontend",
                 desc: "Where your JavaScript lives (vite_rails' sourceCodeDir)"

    class_option :skip_frontend,
                 type: :boolean,
                 default: false,
                 desc: "Only write the Ruby-side files"

    class_option :skip_deploy,
                 type: :boolean,
                 default: false,
                 desc: "Skip bin/web and the assets:precompile hook"

    def copy_initializer
      template "initializer.rb", "config/initializers/universal_renderer.rb"
    end

    def copy_frontend
      return if options[:skip_frontend]

      template "ssr/globals.ts", "#{frontend_dir}/ssr/globals.ts"
      template "ssr/config.ts", "#{frontend_dir}/ssr/config.ts"
      template "ssr/server.ts", "#{frontend_dir}/ssr/server.ts"
      template "ssr/dev.ts", "#{frontend_dir}/ssr/dev.ts"
      template "vite.config.ssr.mts", "vite.config.ssr.mts"
    end

    def copy_deploy_files
      return if options[:skip_deploy] || options[:skip_frontend]

      template "ssr.rake", "lib/tasks/ssr.rake"
      template "web", "bin/web"
      chmod "bin/web", 0o755
    end

    def show_installation_notes
      say_status "info", "Universal Renderer installed."
      say_status "note", "Next steps:"
      if options[:skip_frontend]
        say_status "", "  1. Review config/initializers/universal_renderer.rb"
        say_status "", "  2. Connect your existing renderer to that endpoint"
        say_status "", "  3. Opt a controller in with `enable_ssr` or `render_ssr`"
        return
      end

      say_status "", "  1. bun add universal-renderer   (or npm/yarn)"
      say_status "", "  2. Fill in #{frontend_dir}/ssr/config.ts — the render itself"
      say_status "", "  3. Add the renderer to Procfile.dev:"
      say_status "", "       ssr: bun #{frontend_dir}/ssr/dev.ts"
      say_status "", "  4. Add a build script to package.json:"
      say_status "",
                 '       "build:ssr": "vite -c vite.config.ssr.mts build"'
      say_status "", "  5. Opt a controller in with `enable_ssr` or `render_ssr`"
      return if options[:skip_deploy]

      say_status "", "  6. Point Procfile's web process at bin/web, which runs"
      say_status "", "     the renderer alongside your app server"
    end

    private

    def frontend_dir
      options[:frontend_dir].delete_suffix("/")
    end
  end
end
