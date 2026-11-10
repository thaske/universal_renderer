# frozen_string_literal: true

require "rails_helper"
require "rails/generators"
require "generators/universal_renderer/install_generator"
require "fileutils"
require "tmpdir"

RSpec.describe UniversalRenderer::InstallGenerator do
  let(:plugin_line) { 'plugin :universal_renderer if ENV.fetch("RAILS_ENV", "development") == "production"' }

  def write(destination, path, contents)
    FileUtils.mkdir_p(File.dirname(File.join(destination, path)))
    File.write(File.join(destination, path), contents)
  end

  def generate(destination, *args)
    output = StringIO.new
    $stdout = output
    described_class.start(args, destination_root: destination)
    output.string
  ensure
    $stdout = STDOUT
  end

  it "writes only the Ruby initializer when frontend scaffolding is skipped" do
    Dir.mktmpdir do |destination|
      write(destination, "config/puma.rb", "workers 2\n")

      generate(destination, "--skip-frontend")

      expect(File).to exist(File.join(destination, "config/initializers/universal_renderer.rb"))
      expect(File).not_to exist(File.join(destination, "vite.config.ssr.mts"))
      expect(File).not_to exist(File.join(destination, "lib/tasks/ssr.rake"))
      expect(File.read(File.join(destination, "config/puma.rb"))).to eq("workers 2\n")
    end
  end

  it "adds the Puma plugin for production, once" do
    Dir.mktmpdir do |destination|
      write(destination, "config/puma.rb", "workers 2\n")

      2.times { generate(destination) }

      puma_config = File.read(File.join(destination, "config/puma.rb"))
      expect(puma_config.scan("plugin :universal_renderer").size).to eq(1)
      # Development runs the dev renderer from Procfile.dev on the same port.
      expect(puma_config).to include(plugin_line)
    end
  end

  it "leaves an app that still runs bin/web alone and explains the switch" do
    Dir.mktmpdir do |destination|
      write(destination, "config/puma.rb", "workers 2\n")
      write(destination, "bin/web", "#!/usr/bin/env bash\n")

      output = generate(destination)

      # Both bin/web and the plugin would start a renderer on the same port.
      expect(File.read(File.join(destination, "config/puma.rb"))).to eq("workers 2\n")
      expect(output).to include("bin/web is no longer generated", plugin_line)
    end
  end

  it "prints the plugin line when the app has no Puma config" do
    Dir.mktmpdir do |destination|
      output = generate(destination)

      expect(File).not_to exist(File.join(destination, "config/puma.rb"))
      expect(output).to include(plugin_line)
    end
  end

  it "generates timeouts with the renderer finishing first" do
    Dir.mktmpdir do |destination|
      generate(destination)

      initializer = File.read(File.join(destination, "config/initializers/universal_renderer.rb"))
      server = File.read(File.join(destination, "app/frontend/ssr/server.ts"))

      expect(initializer).to include("c.timeout = 3")
      expect(server).to include("renderTimeout: 2_500")
    end
  end
end
