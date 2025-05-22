# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--

## [0.1.0] - YYYY-MM-DD

### Ruby Gem

#### Added

- Initial release of Ruby Gem
- Rails integration helpers
- Template streaming support
- Early-hints utilities
- Generators

#### Changed

- Improved performance of template rendering
- Updated dependency requirements for Rails 7.x compatibility

#### Fixed

- Fixed race condition in template streaming
- Resolved memory leak in helper methods

#### Deprecated

- Legacy renderer API, use new streaming API instead
- Old configuration format, see migration guide

#### Removed

- Support for Rails 5.x
- Deprecated utility functions

### NPM Package

#### Added

- Initial release of NPM package
- Vite dev server integration
- Frontend framework adapters
- JSON protocol implementation

#### Changed

- Optimized bundle size with tree-shaking
- Improved TypeScript type definitions

#### Fixed

- Fixed hot module reloading for Vue components
- Resolved path resolution in Windows environments

#### Deprecated

- Legacy API methods, see migration guide
- Direct DOM manipulation utilities

#### Removed

- Support for Internet Explorer
- Beta-only experimental features

[Unreleased]: https://github.com/username/universal_renderer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/username/universal_renderer/releases/tag/v0.1.0

-->

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
