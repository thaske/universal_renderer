# frozen_string_literal: true

# No :environment dependency: bundling the frontend does not need Rails booted,
# and booting it during precompile only adds ways for the build to fail —
# credentials, a database that is not up yet.
# rubocop:disable Rails/RakeEnvironment
namespace :ssr do
  desc "Build the standalone SSR bundle that bin/web runs (ssr-build/)"
  task :build do
    # Goes through the package script rather than invoking `vite` directly:
    # node_modules/.bin is not on PATH during a deploy build, so a bare `vite`
    # fails there while working fine in a shell with the toolchain loaded.
    # Swap `bun run` for `npm run` / `yarn` to match your package manager.
    sh "bun run build:ssr"
  end
end
# rubocop:enable Rails/RakeEnvironment

# bin/web runs the compiled bundle, so it has to exist by the time a release
# boots. Build it with the rest of the assets.
if Rake::Task.task_defined?("assets:precompile")
  Rake::Task["assets:precompile"].enhance(["ssr:build"])
else
  # No asset pipeline here, so define the task rather than skipping the build
  # and shipping a release with no renderer.
  Rake::Task.define_task("assets:precompile" => "ssr:build")
end
