# frozen_string_literal: true

namespace :ssr do
  desc "Build the standalone SSR bundle that bin/web runs (ssr-build/)"
  task build: :environment do
    sh "vite -c vite.config.ssr.mts build"
  end
end

# bin/web runs the compiled bundle, so it has to exist by the time a release
# boots. Build it with the rest of the assets.
Rake::Task["assets:precompile"].enhance(["ssr:build"]) if
  Rake::Task.task_defined?("assets:precompile")
