# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.4.2 - 2025-05-23

### Ruby Gem

#### Added

- Comprehensive testing infrastructure with RSpec configuration and test helpers
- Integration test framework for validating HTTP contracts between Ruby gem and NPM package
- Test fixtures for SSR responses and HTML templates (`spec/fixtures/`)
- Performance testing capabilities with benchmarking and analysis
- Test coverage reporting with configurable targets (95% for unit tests, 85% overall)
- Multiple test execution scripts:
  - `bin/test` - Quick Ruby unit tests
  - `bin/test:coverage` - Generate coverage reports for both Ruby and NPM
  - `bin/test:full` - Complete test suite (Ruby + NPM)
  - `bin/test:integration` - Integration tests for HTTP contracts
  - `bin/test:performance` - Performance benchmarks and analysis
  - `bin/test:report` - HTML and Markdown test reporting
  - `bin/test:watch` - Automated test watching with file change detection
- JSON schema validation for SSR requests and responses
- Mock utilities and test server generation for integration testing
- GitHub Actions CI workflow with matrix testing across Ruby 3.2/3.3 and Bun versions

#### Changed

- Updated `ssr_head` and `ssr_body` methods to return placeholders directly
- Simplified `ssr_streaming?` method implementation with controller delegation
- Updated development dependencies including Rails 7.2.2.1 and enhanced RuboCop configuration

#### Fixed

- Enhanced error handling and validation in streaming methods
- Improved integration test reliability with better server management

### NPM Package

#### Added

- **Hostname parameter**: `createServer` function now accepts an optional `hostname` parameter in `CreateServerOptions`
- Server configuration now supports custom hostname binding (defaults to Bun's default if not specified)
- Comprehensive test suite using Vitest with React Testing Library
- Test dependencies: `@testing-library/jest-dom`, `@testing-library/react`, `jsdom`, `vitest`
- Coverage reporting configuration for NPM package tests
- Integration with Ruby gem testing framework for end-to-end validation

#### Changed

- Server console logging now displays the actual resolved hostname and port
- Simplified build scripts to focus on main entry point (`src/index.ts`)
- Streamlined watch command for development

#### Fixed

- Improved test stability and coverage reporting

### Documentation

#### Added

- CI status badge in README indicating GitHub Actions workflow status
- Comprehensive testing documentation (`spec/README.md`) covering:
  - Test directory structure and organization
  - Running tests for both Ruby and NPM components
  - Testing guidelines and best practices
  - Configuration details for RSpec and Vitest
  - Continuous Integration information

## 0.4.1 - 2025-05-21

### Ruby Gem

#### Added

- Introduced `UniversalRenderer::SSR::Response` value object to formalise the contract with the Node SSR service.
- `Client::Base.fetch` now returns a typed `SSR::Response` instance.
- `universal_renderer.rb` autoloads the new response object for application code.

#### Changed

- Renamed `Stream.stream` method to `Stream.call` for clearer intent
- Improved method visibility by removing underscore prefixes from internal methods
- Simplified error handling in streaming module
- Streamlined response handling for cleaner fallback to standard rendering
- Renamed SSR placeholder constant from `META` to `HEAD` for clearer semantics
- Renamed `use_ssr_streaming?` to `ssr_streaming?` for more explicit naming
- Error logging helpers in the streaming pipeline are now public and have descriptive names
- Bumped gem version constant and `Gemfile.lock` to `0.4.1`.

#### Fixed

- Fixed streaming failure detection and logging
- Improved error handling when SSR server is unavailable

### NPM Package

#### Added

- Native Bun HTTP server support through the new `createServer` helper with zero external runtime dependencies
- JSON rendering pipeline with `setup`, `render`, and `cleanup` lifecycle callbacks
- Streaming-specific hooks (`onReady`, `onChunk`, `onFinish`) for fine-grained control over React SSR
- Strongly-typed `ServerOptions` contract (`src/types/serverOptions.ts`) and internal `SSR_MARKERS` constants
- Development typings for Bun via `@types/bun`

#### Changed

- Replaced Express with Bun — the package **no longer depends on `express`**; bundle size and cold-start time reduced
- Stream handler completely rewritten for stricter type-safety, meta-tag injection, and hardened error handling
- Build & watch scripts migrated to Bun; `engines` field removed; peer-dependencies updated
- Consolidated all exports into the top-level entry file; removed framework-specific sub-paths
- Error responses are now signalled only via status codes; bodies kept empty for smaller payloads
- Simplified error handling in stream handlers and improved graceful failure mode to allow Rails fallback
- Streamlined response handling and error reporting
- Cleaned up README SSR example by removing a redundant `<script id="state">` tag.

#### Removed

- `express` and `@types/express` dependencies
- Legacy files `staticHandler.ts`, `utils.ts`, and `types.ts`
- Deprecated `configureExpressApp` helper (renamed to `middleware` in 0.4.0)

#### Fixed

- Unhandled promise rejections when clients disconnected mid-stream
- Memory leak in the previous Express pipeline

## 0.4.0 - 2025-05-21

### Ruby Gem

#### Added

- Support for returning streaming status to enable fallback rendering

#### Changed

- Improved streaming implementation with simpler layout handling
- Removed direct header manipulation from renderable module
- Updated streaming API to return success/failure status
- Added trailing commas to multi-line logging statements

#### Fixed

- Fixed error handling in streaming mode

### NPM Package

#### Added

- CJS exports alongside ESM
- Streamlined React stream rendering with simplified API
- Support for custom middleware integration without Vite dependency

#### Changed

- Renamed `configureExpressApp` to `middleware`
- Renamed `onError` callback to `error` callback
- Simplified template handling for React streams
- Updated TypeScript types for better flexibility
- Build scripts now generate both ESM and CJS formats

#### Fixed

- Fixed hot module reloading for Vue components
- Resolved path resolution in Windows environments

#### Removed

- Vite dependency requirement in `createSsrServer`
- Removed mandatory Vite middleware usage
