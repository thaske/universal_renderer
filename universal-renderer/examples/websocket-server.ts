import React from "react";
import { renderToString } from "react-dom/server";
import { createWebSocketServer } from "../src/index";

// Example React component
function App({ url, props }: { url: string; props: any }) {
  return React.createElement(
    "div",
    { id: "app" },
    React.createElement("h1", null, `Hello from ${url}`),
    React.createElement("pre", null, JSON.stringify(props, null, 2)),
  );
}

// Create WebSocket SSR server
const server = await createWebSocketServer({
  setup: async (url, props) => {
    console.log(`Setting up SSR for ${url} with props:`, props);
    return { url, props };
  },

  render: async (context) => {
    const body = renderToString(React.createElement(App, context));
    return {
      head: "<title>WebSocket SSR Example</title>",
      body,
      bodyAttrs: 'class="websocket-ssr"',
    };
  },

  cleanup: (context) => {
    console.log(`Cleaning up SSR for ${context.url}`);
  },

  streamCallbacks: {
    onStream: async (context, writer, template) => {
      // Example streaming implementation
      writer.write("<!DOCTYPE html><html><head>");
      writer.write("<title>Streaming WebSocket SSR</title>");
      writer.write("</head><body>");

      // Simulate streaming chunks
      const chunks = [
        "<h1>Streaming Content</h1>",
        "<p>This is chunk 1</p>",
        "<p>This is chunk 2</p>",
        `<p>URL: ${context.url}</p>`,
        `<pre>${JSON.stringify(context.props, null, 2)}</pre>`,
      ];

      for (const chunk of chunks) {
        writer.write(chunk);
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      writer.write("</body></html>");
      writer.end();
    },
  },

  port: 3000,

  onConnection: (connection) => {
    console.log(`New WebSocket connection: ${connection.id}`);
  },

  onDisconnection: (connection, code, message) => {
    console.log(
      `WebSocket disconnected: ${connection.id} (${code}: ${message})`,
    );
  },

  onError: (connection, error) => {
    console.error(`WebSocket error for ${connection.id}:`, error);
  },
});

console.log("WebSocket SSR server started!");
console.log("Connect with: ws://localhost:3000");
console.log(
  "Send SSR request: { id: '1', type: 'ssr_request', payload: { url: '/test', props: { name: 'World' } } }",
);
console.log(
  "Send health check: { id: '2', type: 'health_check', payload: {} }",
);
