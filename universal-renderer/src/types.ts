import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ReactNode } from "react";

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
 * Base configuration for handlers that use setup/render/cleanup pattern.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type BaseHandlerOptions<TContext extends Record<string, any>> = {
  /**
   * Setup function called before rendering to prepare the context.
   * @param url - The URL being rendered
   * @param props - Additional props passed from the client
   * @returns Context object that will be passed to render and cleanup functions
   *
   * @example
   * ```typescript
   * setup: (url, props) => {
   *     const pathname = new URL(url).pathname;
   *
   *     const app = sheet.collectStyles(
   *       <StaticRouter location={pathname}>
   *         <App />
   *       </StaticRouter>
   *     );
   *
   *     return { app };
   *   }
   * ```
   */
  setup: (
    url: string,
    props: Record<string, any>,
  ) => Promise<TContext> | TContext;

  /**
   * Optional cleanup function called after rendering is complete.
   * @param context - The context object returned by the setup function
   */
  cleanup?: (context: TContext) => void;

  /**
   * Optional error handler to be applied to the server.
   * This error handler will be applied after the built-in middleware but before the error handler.
   */
  error?: ErrorRequestHandler;
};

/**
 * Configuration options for the SSR handler.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type SSRHandlerOptions<TContext extends Record<string, any>> =
  BaseHandlerOptions<TContext> & {
    /**
     * Main render function that produces the SSR output.
     * @param context - The context object returned by the setup function
     * @returns The rendered output containing head, body, and optional body attributes
     */
    render: (context: TContext) => Promise<RenderOutput> | RenderOutput;
  };

/**
 * Configuration options for the streaming SSR handler.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type StreamHandlerOptions<TContext extends Record<string, any>> =
  BaseHandlerOptions<TContext> & {
    /**
     * Streaming callbacks for React 18+ streaming SSR.
     */
    streamCallbacks: {
      /**
       * Function to extract the React component/element to be streamed.
       * This is the primary way to specify what React content should be rendered.
       * If not provided, the handler will fall back to looking for `context.app` or `context.jsx` properties.
       *
       * @param context - The context object returned by the setup function
       * @returns The React node (component, element, or JSX) to be passed to React's streaming renderer
       *
       * @example
       * ```typescript
       * node: (context) => context.app
       * ```
       */
      node?: (context: TContext) => ReactNode;

      /**
       * Optional function to generate head content for streaming.
       * @param context - The context object from setup()
       * @returns HTML string for the head section
       *
       * @example
       * ```typescript
       * head: (context) => {
       *   return `<meta name="description" content="...">`;
       * }
       * ```
       */
      head?: (context: TContext) => Promise<string> | string;

      /**
       * Optional transform stream for processing the rendered output.
       * @param context - The context object from setup()
       * @returns Transform stream to process the output
       *
       * @example
       * ```typescript
       * transform: (context) => {
       *   return new TransformStream();
       * }
       * ```
       */
      transform?: (context: TContext) => NodeJS.ReadWriteStream;
    };
  };

/**
 * Configuration options for creating an SSR server.
 * @template TContext - The type of context object passed between setup, render, and cleanup functions
 */
export type ServerOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = SSRHandlerOptions<TContext> & {
  /**
   * Optional streaming callbacks for React 18+ streaming SSR.
   * When provided, enables the `/stream` endpoint for streaming responses.
   */
  streamCallbacks?: StreamHandlerOptions<TContext>["streamCallbacks"];

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
