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

## [0.4.0] - 2025-05-21

### NPM Package

#### Added

- CJS exports

#### Changed

- configureExpressApp -> middleware
- onError callback -> error callback

#### Fixed

- Fixed hot module reloading for Vue components
- Resolved path resolution in Windows environments

#### Deprecated

- Legacy API methods, see migration guide
- Direct DOM manipulation utilities

#### Removed

- Importing Vite dependency injection in createSsrServer

[0.4.0]: https://github.com/thaske/universal_renderer/releases/tag/v0.4.0
