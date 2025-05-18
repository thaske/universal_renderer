source "https://rubygems.org"
git_source(:github) { |repo| "https://github.com/#{repo}.git" }

# Specify your gem's dependencies in universal_renderer.gemspec.
gemspec

gem "puma"

gem "sqlite3"

# Start debugger with binding.b [https://github.com/ruby/debug]
# gem "debug", ">= 1.0.0"

group :development do
  gem "rspec-rails", "~> 6.0"
  gem "webmock", "~> 3.18"

  gem "prettier_print", "~> 1.2"
  gem "syntax_tree", "~> 6.2"
  gem "syntax_tree-haml", "~> 4.0"
  gem "syntax_tree-rbs", "~> 1.0"
end

group :test do
end
