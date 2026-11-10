# frozen_string_literal: true

module UniversalRenderer
  # Scaffolds a working SSR setup: the initializer, the two renderer entry points,
  # the SSR Vite build, the precompile hook, and the Puma plugin that runs the
  # renderer in production. Each one encodes something that is wrong by default
  # and fails silently.
  class InstallGenerator < Rails::Generators::Base
    source_root File.expand_path("templates", __dir__)

    PUMA_CONFIG = "config/puma.rb"
    PUMA_PLUGIN_LINE = 'plugin :universal_renderer if ENV.fetch("RAILS_ENV", "development") == "production"'

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
                 desc: "Skip the Puma plugin and the assets:precompile hook"

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
      add_puma_plugin if puma_setup == :add
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

      case puma_setup
      when :add
        say_status "", "  6. Puma now starts the renderer in production (`plugin"
        say_status "", "     :universal_renderer` in config/puma.rb). Keep Procfile's web"
        say_status "", "     process as it is"
      when :bin_web
        say_status "", "  6. bin/web is no longer generated. Point Procfile's web process"
        say_status "", "     at Puma, delete bin/web, and add to config/puma.rb:"
        say_status "", "       #{PUMA_PLUGIN_LINE}"
      when :no_config
        say_status "", "  6. Start the renderer with your app server. With Puma, add to"
        say_status "", "     its config:"
        say_status "", "       #{PUMA_PLUGIN_LINE}"
      end
    end

    private

    def frontend_dir
      options[:frontend_dir].delete_suffix("/")
    end

    # Decided once, before any file is written. An app that still runs the
    # bin/web from an earlier version is left alone: adding the plugin as well
    # would start a second renderer on the same port.
    def puma_setup
      @puma_setup ||=
        if File.exist?(File.join(destination_root, "bin/web"))
          :bin_web
        elsif File.exist?(File.join(destination_root, PUMA_CONFIG))
          :add
        else
          :no_config
        end
    end

    def add_puma_plugin
      return if File.read(File.join(destination_root, PUMA_CONFIG)).match?(/^\s*plugin :universal_renderer\b/)

      append_to_file PUMA_CONFIG, <<~RUBY

        # Runs the SSR renderer beside Puma, and restarts it when it exits or
        # stops answering /health. Production only: in development, Procfile.dev
        # runs the development renderer on the same port.
        # Options: `universal_renderer runtime: "bun", bundle: "ssr-build/server.mjs", port: 3001`.
        #{PUMA_PLUGIN_LINE}
      RUBY
    end
  end
end
