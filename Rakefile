require "bundler/setup"

APP_RAKEFILE = File.expand_path("test/dummy/Rakefile", __dir__)
if File.exist?(APP_RAKEFILE)
  load "rails/tasks/engine.rake"
  load "rails/tasks/statistics.rake"
end

require "bundler/gem_tasks"

Dir[File.expand_path("lib/tasks/**/*.rake", __dir__)].each { |task| load task }
