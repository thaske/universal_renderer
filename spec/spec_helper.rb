# frozen_string_literal: true

require "bundler/setup"

# Load Rails and ActiveSupport first
require "rails"
require "active_support/all"

# Now we can safely require the main module
require "universal_renderer"

# Configure RSpec
RSpec.configure do |config|
  # Use the documentation formatter for verbose output
  config.default_formatter = "doc" if config.files_to_run.one?

  # Disable RSpec exposing methods globally on Module and main
  config.disable_monkey_patching!

  # Enable flags like --only-failures and --next-failure
  config.example_status_persistence_file_path = ".rspec_status"

  # Limit to one concurrent thread to avoid issues with global state
  config.filter_run :focus
  config.run_all_when_everything_filtered = true

  # Allow more verbose output when running an individual spec file
  config.profile_examples = 10 if config.files_to_run.one?

  # Run specs in random order to surface order dependencies
  config.order = :random
  Kernel.srand config.seed

  # Expectations configuration
  config.expect_with :rspec do |expectations|
    # This option will default to `true` in RSpec 4
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
  end

  # Mocks configuration
  config.mock_with :rspec do |mocks|
    # Prevents you from mocking or stubbing a method that does not exist
    mocks.verify_partial_doubles = true
  end

  # This option will default to `:apply_to_host_groups` in RSpec 4
  config.shared_context_metadata_behavior = :apply_to_host_groups
end
