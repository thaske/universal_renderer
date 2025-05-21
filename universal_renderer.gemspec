require_relative "lib/universal_renderer/version"

Gem::Specification.new do |spec|
  spec.name = "universal_renderer"
  spec.version = UniversalRenderer::VERSION
  spec.authors = ["thaske"]
  spec.email = ["10328778+thaske@users.noreply.github.com"]
  spec.homepage = "https://github.com/thaske/universal_renderer"
  spec.summary =
    "Facilitates Server-Side Rendering (SSR) in Rails applications."
  spec.description =
    "Provides helper methods and configuration to forward rendering requests " \
      "from a Rails app to an external SSR server and return the response."
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.0.0"

  spec.metadata["allowed_push_host"] = "https://rubygems.org"

  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["changelog_uri"] = "#{spec.homepage}/blob/main/CHANGELOG.md"

  spec.files =
    Dir.chdir(File.expand_path(__dir__)) do
      Dir["{app,config,db,lib}/**/*", "MIT-LICENSE", "Rakefile", "README.md"]
    end

  spec.add_dependency "loofah", "~> 2.24"
  spec.add_runtime_dependency "rails", "~> 7.1"
end
