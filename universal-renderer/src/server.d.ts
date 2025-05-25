import type { RequestHandler } from "express";

/**
 * The output structure returned by the render function.
 * This represents the rendered SSR content that will be sent to the client.
 */
export type RenderOutput = {
  /**
   * HTML content to be injected into the document head.
   * Typically includes meta tags, stylesheets, and other head elements.
   * @example "<meta name='description' content='...'><link rel='stylesheet' href='...'>"
   */
  head?: string;

  /**
   * The main HTML content to be rendered in the document body.
   * This is the primary rendered content of your application.
   * @example "<div id='app'><h1>Hello World</h1></div>"
   */
  body: string;

  /**
   * Additional attributes to be applied to the body element.
   * Useful for adding classes, data attributes, or other body-level attributes.
   * @example "class='dark-theme' data-page='home'"
   */
  bodyAttrs?: string;
};

/**
 * Configuration options for creating an SSR server.
 * @template TContext - The type of context object passed between setup, render, and cleanup functions
 */
export type ServerOptions<TContext = any> = {
  /**
   * The hostname to bind the server to.
   * @default "localhost"
   */
  hostname?: string;

  /**
   * The port number to listen on.
   * @default 3001
   */
  port?: number;

  /**
   * Setup function called before rendering to prepare the context.
   * This is where you can set up routing, load data, configure your app, etc.
   *
   * @param url - The URL being rendered (e.g., "/about", "/products/123")
   * @param props - Additional props passed from the Rails application
   * @returns Context object that will be passed to render and cleanup functions
   *
   * @example
   * ```typescript
   * setup: async (url, props) => {
   *   const router = createRouter();
   *   const store = createStore(props.initialState);
   *   return { router, store, url, props };
   * }
   * ```
   */
  setup: (url: string, props: any) => Promise<TContext> | TContext;

  /**
   * Main render function that produces the SSR output.
   * This function receives the context from setup() and should return the rendered HTML.
   *
   * @param context - The context object returned by the setup function
   * @returns The rendered output containing head, body, and optional body attributes
   *
   * @example
   * ```typescript
   * render: async (context) => {
   *   const html = renderToString(<App router={context.router} store={context.store} />);
   *   const helmet = Helmet.renderStatic();
   *   return {
   *     head: helmet.title.toString() + helmet.meta.toString(),
   *     body: html,
   *     bodyAttrs: 'class="app-loaded"'
   *   };
   * }
   * ```
   */
  render: (context: TContext) => Promise<RenderOutput> | RenderOutput;

  /**
   * Optional cleanup function called after rendering is complete.
   * Use this to clean up resources, close connections, etc.
   *
   * @param context - The context object returned by the setup function
   *
   * @example
   * ```typescript
   * cleanup: (context) => {
   *   context.store.dispose();
   *   context.router.cleanup();
   * }
   * ```
   */
  cleanup?: (context: TContext) => void;

  /**
   * Optional streaming callbacks for React 18+ streaming SSR.
   * When provided, enables the `/stream` endpoint for streaming responses.
   */
  streamCallbacks?: {
    /**
     * Returns the React element to be streamed.
     * This should be your root App component configured with the context.
     *
     * @param context - The context object from setup()
     * @returns React element to stream
     *
     * @example
     * ```typescript
     * app: (context) => <App router={context.router} store={context.store} />
     * ```
     */
    app: (context: TContext) => React.ReactElement;

    /**
     * Optional function to generate head content for streaming.
     * This content will be injected into the <!-- SSR_HEAD --> marker.
     *
     * @param context - The context object from setup()
     * @returns HTML string for the head section
     *
     * @example
     * ```typescript
     * head: async (context) => {
     *   const helmet = await getHelmetData(context);
     *   return helmet.title.toString() + helmet.meta.toString();
     * }
     * ```
     */
    head?: (context: TContext) => Promise<string> | string;

    /**
     * Optional transform stream for processing the rendered output.
     * Useful for post-processing the HTML, compression, etc.
     *
     * @param context - The context object from setup()
     * @returns Transform stream to process the output
     */
    transform?: (context: TContext) => NodeJS.ReadWriteStream;

    /**
     * Optional callback called when streaming is complete.
     * Use this for cleanup or final processing before the response ends.
     *
     * @param stream - The response stream
     * @param context - The context object from setup()
     */
    close?: (stream: any, context: TContext) => Promise<void> | void;
  };

  /**
   * Optional Express middleware to be applied to the server.
   * This middleware will be applied after the built-in middleware but before the error handler.
   *
   * @example
   * ```typescript
   * middleware: (req, res, next) => {
   *   // Add custom headers, authentication, etc.
   *   res.setHeader('X-Custom-Header', 'value');
   *   next();
   * }
   * ```
   */
  middleware?: RequestHandler;
};
