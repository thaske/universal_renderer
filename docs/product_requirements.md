# Product Requirements Document: universal_renderer

## 1. Introduction

`universal_renderer` is a dual-component system designed to integrate Server-Side Rendering (SSR) into Ruby on Rails applications. It consists of:

1.  A Ruby gem (`universal_renderer`) that integrates with Rails to manage SSR requests and responses.
2.  An NPM package (`universal-renderer`) that provides a configurable SSR server, currently leveraging Vite and Express, with a primary focus on React-based frontends.

The project aims to simplify the complexities of SSR, offering improved performance, SEO, and user experience for JavaScript-heavy applications.

## 2. Goals

1.  **Sane and Simple API:** Continue developing and supporting the Gem/NPM package with a clear, intuitive, and easy-to-use API.
2.  **Broad Stack Support:** Expand compatibility to support various frontend technologies beyond the current React/Vite focus.
3.  **Excellent DX and Documentation:** Provide comprehensive, easy-to-understand documentation (JSDoc, YARD comments) and enhance the developer experience (e.g., better error messages, setup guides).

## 3. Current State

### 3.1. Ruby Gem (`universal_renderer`)

- **Functionality:**
  - Handles communication with an external SSR server.
  - Supports both static and streaming SSR responses.
  - Provides Rails controller concerns (`UniversalRenderer::Rendering`) to override `default_render` for automatic SSR.
  - Offers helper methods (`add_prop`) to pass data from Rails controllers to the SSR service.
  - Includes view helpers (`ssr_meta`, `ssr_body`) for template integration, crucial for streaming.
  - Configurable SSR server URL, timeout, and stream path via initializer or environment variables.
  - Fallback to client-side rendering (CSR) on SSR failure.
  - Relies on conventional template paths (`app/views/ssr/index.html.erb`, `app/views/application/index.html.erb`).
- **Dependencies:** `rails >= 7.1.5.1`, `loofah`.
- **Installation:** Via Bundler and a Rails generator (`universal_renderer:install`).
- **Documentation:** `README.md` provides a good overview of setup and usage. `CHANGELOG.md` is mentioned in gemspec but its presence/content is unverified.

### 3.2. NPM Package (`universal-renderer`)

- **Functionality:**
  - Acts as the external SSR server expected by the Ruby gem.
  - Built with Express.
  - Designed to work with Vite for bundling/serving frontend assets.
  - Currently expects a React-based frontend.
  - Handles POST requests for static (`/` or `/static` - needs clarification based on README note) and streaming (`/stream`) rendering.
  - Receives `url`, `props`, and (for streaming) `template` from the Ruby gem.
  - Returns JSON for static requests and an HTML stream for streaming requests.
- **Dependencies:** `express`.
- **Peer Dependencies:** `react`, `react-dom`, `vite`.
- **Build System:** Uses `tsdown` for compiling TypeScript to JavaScript (`dist/index.mjs`).
- **Documentation:** `README.md` in the NPM package sub-directory likely contains setup and usage specific to the Node.js server. (Content unverified).

### 3.3. Overall Project Structure

- Monorepo structure with a root `package.json` managing workspaces (specifically the `universal-renderer` NPM package).
- Contains standard Ruby gem file structure (`lib/`, `app/`, `config/`, `spec/`).
- Includes configuration for Prettier and Rubocop for code styling.

## 4. Areas for Improvement & Future Development

Based on the project goals and current state:

### 4.1. Enhance API and Developer Experience

- **Clearer Error Handling & Reporting:**
  - Provide more descriptive error messages on both the Ruby and Node.js sides when SSR fails (e.g., timeout, SSR script error, misconfiguration).
  - Consider a debug mode that provides more verbose logging.
- **Simplified Setup for SSR Server:**
  - The current NPM package seems to require manual setup with Express, Vite, and React. Could this be more scaffolded or provide clearer examples for different React setups (e.g., with React Router, Redux/Zustand, Styled Components)?
  - Provide a CLI tool within the NPM package to initialize a basic SSR server setup.
- **Props Serialization:**
  - The README mentions ensuring data is serializable (e.g., `product.as_json`). Could the gem offer more built-in assistance or warnings for non-serializable props?
- **Configuration Flexibility:**
  - **Static Endpoint Path:** The README notes a potential mismatch in the default static path (`/` vs `/static`). This should be clarified and made easily configurable on both gem and NPM package sides if necessary.
  - **SSR Server Health Check:** Add an optional health check endpoint that Rails can ping to ensure the SSR server is responsive before attempting rendering.

### 4.2. Broaden Stack Support

- **Decouple from React/Vite:**
  - **Core SSR Logic:** The core responsibility of the NPM package is to receive a request (URL, props, template) and return HTML. This logic could be made more generic.
  - **Adapters/Plugins:** Introduce an adapter or plugin system for the NPM package to support other frameworks/tools:
    - Vue.js, Svelte, SolidJS, Angular.
    - Other bundlers if Vite is too prescriptive.
  - **Generic Template Handling:** The `template` string manipulation for streaming is currently tied to `<!-- SSR_META -->` and `<!-- SSR_BODY -->`. While flexible, ensure this mechanism is well-documented and adaptable for non-HTML or differently structured responses if other frameworks require it.
- **Gem Flexibility:**
  - Ensure the Ruby gem's communication protocol (JSON payloads, endpoint expectations) is clearly defined and stable, allowing any compliant SSR server to be used, not just the provided NPM package.

### 4.3. Documentation and Tooling

- **Comprehensive JSDoc/YARD Comments:**
  - Go through existing Ruby and TypeScript code and add detailed comments for all public APIs, modules, classes, and complex functions.
- **Cookbook/Examples:**
  - Create a dedicated `examples/` directory or extend documentation with complete examples for:
    - Rails + React (with React Router, a state manager, and styled-components as mentioned in initial context).
    - Future examples as new stacks are supported.
- **Detailed `CHANGELOG.md`:** Maintain a clear and detailed changelog for both the gem and NPM package.
- **Contributing Guide:** Add a `CONTRIBUTING.md` with guidelines for setting up the development environment, running tests, and submitting pull requests.
- **Testing:**
  - Expand test coverage for both the Ruby gem (`spec/`) and the NPM package.
  - Include integration tests that verify the communication between the gem and the SSR server.
- **TypeScript Best Practices:** Review and refactor TypeScript code in the NPM package to adhere to modern best practices and improve type safety.

### 4.4. NPM Package Specifics

- **Clarify `dist/index.d.mts`:** Ensure type definitions are correctly generated and usable. The `.d.mts` extension is specific to ES modules with TypeScript.

## 5. Proposed Next Steps (Short Term)

1.  **Documentation Sprint (Low Hanging Fruit):**

    - **Action:** Create `docs/CHANGELOG.md` (or update existing if one is found but not in root).
    - **Action:** Create `CONTRIBUTING.md`.
    - **Action:** Begin adding YARD comments to core Ruby modules/classes in `lib/` and JSDoc comments to critical functions/classes in the NPM package's `src/`.
    - **Action:** Clarify the static endpoint path discrepancy in `README.md` for both gem and NPM package.

2.  **Enhance Error Handling & Debuggability:**

    - **Action (Ruby Gem):** Review error handling in `StaticClient` and `StreamClient`. Add more specific error types or messages.
    - **Action (NPM Package):** Implement better error catching in the Express server routes and ensure errors from the rendering process (e.g., React renderToString errors) are caught and reported meaningfully. Consider sending a structured error JSON back to the Ruby gem for certain types of failures.

3.  **TypeScript Review & Refinement:**

    - **Action:** Conduct a review of the TypeScript codebase in `universal-renderer/src/`. Focus on:
      - Strict type checking and eliminating `any` where possible.
      - Consistent code style and organization.
      - Optimizing type definitions for public APIs.

4.  **Clarify SSR Server Example:**
    - **Action:** Provide a minimal, runnable example of a React application set up to work with the `universal-renderer` NPM package and Vite, demonstrating the expected project structure and Vite configuration. This could live in an `examples/` directory.

## 6. Future Considerations (Medium to Long Term)

- **Adapter System for NPM Package:** Design and implement a plugin/adapter architecture to support other frontend frameworks.
- **CLI for NPM Package:** Develop a CLI tool to scaffold new SSR server projects or integrate into existing ones.
- **Advanced Streaming Features:** Investigate support for more advanced streaming techniques if beneficial (e.g., selective hydration, out-of-order streaming if frontend frameworks support it).
- **Performance Benchmarking:** Establish a baseline for performance and conduct regular benchmarking to identify and address bottlenecks.

## 7. Open Questions

- What is the current versioning strategy for the Ruby gem? Is it tied to the NPM package version? (The gemspec points to `UniversalRenderer::VERSION` which implies it's defined in `lib/universal_renderer/version.rb`).
- Is there an existing `CHANGELOG.md` or `README.md` specifically for the `universal-renderer` NPM package within its own directory?
- What is the current test coverage for both packages?
- The initial context mentioned prototyping with "React Router, React Query, Styled Components". Are there specific plans or desires to ensure seamless integration with these or provide examples?

This document should serve as a starting point for discussion and prioritization of development efforts for `universal_renderer`.
