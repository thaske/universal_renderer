# Universal Renderer

A lightweight, frontend-agnostic server-side rendering solution for Rails applications.

## Overview

Universal Renderer consists of two decoupled components:

1. **Ruby Gem** (`universal_renderer`): Provides Rails integration through helpers, template streaming, early-hints utilities, and generators.

2. **NPM Package** (`universal-renderer`): Handles JavaScript rendering through a Vite-powered server that communicates with the Rails application.

These components communicate via HTTP and structured JSON, allowing either side to be swapped independently.

## Features

- **Simple API surface** with sensible defaults
- **Frontend-agnostic** - works with React, Vue, Svelte, Solid, and more
- **First-class developer experience** with comprehensive documentation
- **Flexible rendering options** - static and streaming rendering support

## How It Works

1. The Rails application uses the Ruby gem to handle requests
2. When server-side rendering is needed, the gem forwards rendering requests to the Node.js server
3. The Node.js server renders the JavaScript application and returns structured JSON
4. The Rails application integrates the rendered content into the response

## Installation

Add both components to your application:

```
# In your Rails application
gem 'universal_renderer'

# In your JavaScript application
npm install universal-renderer
```

## Documentation

For detailed documentation and usage instructions, see:

- Ruby Gem: `lib/universal_renderer.rb`
- NPM Package: `src/index.ts`

## Contributing

Contributions are welcome! Please follow the coding guidelines in the project documentation.
