# Universal Renderer Testing

This directory contains the test suite for the Universal Renderer Ruby gem.

## Directory Structure

```
spec/
├── units/          # Unit tests for individual classes/modules
├── requests/       # Request/controller integration tests
├── integration/    # Cross-artifact integration tests
├── fixtures/       # Test data and HTTP response fixtures
│   └── http/       # JSON fixtures for HTTP responses
├── spec_helper.rb  # Basic RSpec configuration
├── rails_helper.rb # Rails-specific test configuration
└── README.md       # This file
```

## Running Tests

### Quick Start

```bash
# Fast Ruby tests only (recommended for development)
./bin/test

# All tests (Ruby + NPM)
./bin/test:full
```

### Ruby Gem Tests

```bash
# Run all RSpec tests
bundle exec rspec

# Run specific test file
bundle exec rspec spec/units/configuration_spec.rb

# Run with documentation format
bundle exec rspec --format documentation
```

### NPM Package Tests

```bash
cd universal-renderer

# Run all Vitest tests
bun run test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage
```

## Test Organization

### Unit Tests (`spec/units/`)

- Test individual classes and modules in isolation
- No external dependencies (DB, network, file system)
- Fast execution (< 100ms per test)
- High coverage of edge cases and error conditions

**Example:**

```ruby
# spec/units/configuration_spec.rb
RSpec.describe UniversalRenderer::Configuration do
  # Test the configuration class in isolation
end
```

### Request Tests (`spec/requests/`)

- Test Rails controller integration
- Mock external SSR server responses
- Test the full request/response cycle

**Example:**

```ruby
# spec/requests/render_spec.rb (planned)
RSpec.describe "SSR Rendering" do
  # Test Rails helpers and view integration
end
```

### Integration Tests (`spec/integration/`)

- Test communication between Ruby gem and NPM package
- Spawn real SSR servers for testing
- End-to-end request flows

**Example:**

```ruby
# spec/integration/ssr_contract_spec.rb (planned)
RSpec.describe "SSR HTTP Contract" do
  # Test the JSON protocol between gem and server
end
```

## Testing Guidelines

### Ruby Gem Tests

- Use `frozen_string_literal: true` at the top of each spec file
- Follow RSpec best practices (describe/context/it structure)
- Use `let` for test data setup
- Mock external dependencies with `webmock`
- Use `FactoryBot` for complex object creation

### NPM Package Tests

- Use Vitest with JSDOM environment for component tests
- Mock Bun server APIs for unit tests
- Test individual functions/modules in isolation
- Use React Testing Library for component testing

### Shared Guidelines

- Test behavior, not implementation
- Use descriptive test names that explain the expected behavior
- Group related tests with `describe` and `context` blocks
- Each test should be independent and repeatable
- Prefer integration tests for complex workflows

## Configuration

### RSpec Configuration

- **spec_helper.rb**: Basic RSpec setup, no Rails dependencies
- **rails_helper.rb**: Rails-specific configuration for integration tests
- **.rspec**: Command-line options and formatting

### Vitest Configuration

- **vitest.config.ts**: Test environment, coverage, and path resolution
- **src/test/setup.ts**: Global test setup and helpers

## Continuous Integration

Tests run automatically on GitHub Actions for:

- Ruby 3.1, 3.2, 3.3
- RuboCop linting
- Both Ruby and NPM test suites
- Test helper script validation

See `.github/workflows/ci.yml` for the complete CI configuration.
