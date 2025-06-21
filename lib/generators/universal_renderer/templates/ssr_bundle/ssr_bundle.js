// Universal Renderer SSR Bundle Template
// This file provides a basic template for server-side rendering with React.
// Users should customize this file to include their own components and rendering logic.

// This template assumes React and react-dom/server are available
// Users need to ensure these dependencies are bundled appropriately

// Global object for SSR - use globalThis for server environment
globalThis.UniversalSSR = {
  // Main rendering function that the MiniRacer adapter will call
  // @param componentName [String] The name of the component to render
  // @param props [Object] Props to pass to the component
  // @param url [String] The current URL (for routing if needed)
  // @returns [Object] { head: string, body: string, bodyAttrs: object }
  render: function (componentName, props, url) {
    // Default implementation - users should customize this
    // This is just a placeholder that returns basic HTML

    const defaultComponent = `<div>
      <h1>Universal Renderer</h1>
      <p>Component: ${componentName}</p>
      <p>URL: ${url}</p>
      <pre>${JSON.stringify(props, null, 2)}</pre>
      <p><em>Customize app/assets/javascripts/universal_renderer/ssr_bundle.js to add your React components</em></p>
    </div>`;

    return {
      head: "<title>Universal Renderer</title>",
      body: defaultComponent,
      bodyAttrs: {},
    };
  },

  // Helper method for error handling
  handleError: function (error, componentName, props, url) {
    console.error("SSR Error:", error);
    return {
      head: "<title>SSR Error</title>",
      body: `<div><h1>Server-Side Rendering Error</h1><p>Component: ${componentName}</p><pre>${error.toString()}</pre></div>`,
      bodyAttrs: {},
    };
  },
};

// Example of how users might integrate React (commented out by default):
/*
// Uncomment and modify this section to use React:

import React from 'react';
import { renderToString } from 'react-dom/server';

// Import your components here
// import App from './components/App';
// import HomePage from './components/HomePage';

globalThis.UniversalSSR = {
  render: function(componentName, props, url) {
    try {
      // Map component names to actual components
      const components = {
        // App,
        // HomePage,
        // Add your components here
      };

      const Component = components[componentName];
      if (!Component) {
        throw new Error(`Unknown component: ${componentName}`);
      }

      const element = React.createElement(Component, { ...props, url });
      const body = renderToString(element);

      return {
        head: '<title>Your App</title>',
        body: body,
        bodyAttrs: {}
      };
    } catch (error) {
      return this.handleError(error, componentName, props, url);
    }
  },

  handleError: function(error, componentName, props, url) {
    console.error('SSR Error:', error);
    const errorComponent = React.createElement('div', {},
      React.createElement('h1', {}, 'Server-Side Rendering Error'),
      React.createElement('p', {}, `Component: ${componentName}`),
      React.createElement('pre', {}, error.toString())
    );

    return {
      head: '<title>SSR Error</title>',
      body: renderToString(errorComponent),
      bodyAttrs: {}
    };
  }
};
*/
