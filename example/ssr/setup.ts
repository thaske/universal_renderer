import React from 'react';

// A simple React component for demonstration
const App = ({ name }: { name: string }) => (
  <div>
    <h1>Hello, {name}!</h1>
    <p>This is a server-rendered React component.</p>
  </div>
);

// Mock helmetContext, sheet, and state for the example
// In a real app, helmetContext would be from react-helmet-async
// sheet would be from a CSS-in-JS library like styled-components
// state would be your application's initial state

interface SetupParams {
  req: any; // Replace with actual request type, e.g., express.Request
  // res: any; // Replace with actual response type if needed, e.g., express.Response
}

const setup = async ({ req }: SetupParams) => {
  // You can access request details via `req` if needed
  // For example, to get query parameters or headers
  const name = req.query?.name || "World";

  const helmetContext: Record<string, any> = {};
  const sheet = {
    getStyleTags: () => "<style>/* CSS-in-JS styles would go here */</style>",
    seal: () => {},
  }; // Mock ServerStyleSheet from styled-components or similar
  const state = { user: null, initialData: {} }; // Example initial state

  // The JSX to be rendered
  const jsx = <App name={name} />;

  return {
    jsx,
    helmetContext,
    sheet,
    state,
    // You might also return other things like a QueryClient for react-query
    // queryClient: new QueryClient(),
  };
};

export default setup;
