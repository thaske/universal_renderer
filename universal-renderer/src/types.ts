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
   * Additional attributes to be applied to the body element, as a
   * name→value map. Serialized to the Ruby side as the `body_attrs` hash and
   * emitted by the `ssr_body_attributes` view helper.
   * @example { class: "dark-theme", "data-page": "home" }
   */
  bodyAttrs?: Record<string, string>;

  /**
   * Arbitrary JSON-serializable state the client needs in order to hydrate.
   *
   * This exists because the interesting hydration state is only known *after*
   * the render: a dehydrated query cache, the class names a CSS-in-JS library
   * already emitted into `head`. Rails emits it through the `ssr_payload`
   * helper, which handles the escaping, so do not hand-roll a script tag.
   *
   * @example { queryCache: dehydrate(queryClient), styleIds: sheet.renderedClassNames }
   */
  payload?: unknown;
};

/**
 * Base configuration for handlers that use the setup/prepare/render/cleanup
 * pipeline.
 * @template TContext - The type of context object used throughout the rendering pipeline
 */
export type BaseHandlerOptions<TContext extends Record<string, any>> = {
  /**
   * Setup function called before rendering to prepare the context.
   *
   * Keep this free of side effects on module-level state. It may await, and a
   * mutation made before an await point stays visible for as long as the await
   * lasts. Put those in {@link BaseHandlerOptions.prepare} instead.
   *
   * @param url - The URL being rendered
   * @param props - Additional props passed from the client
   * @returns Context object that will be passed to render and cleanup functions
   *
   * @example
   * ```typescript
   * setup: async (url, props) => {
   *     const pathname = new URL(url).pathname;
   *     await preloadRoute(pathname);
   *
   *     const sheet = new ServerStyleSheet();
   *     const app = sheet.collectStyles(
   *       <StaticRouter location={pathname}>
   *         <App />
   *       </StaticRouter>
   *     );
   *
   *     return { app, sheet };
   *   }
   * ```
   */
  setup: (
    url: string,
    props: Record<string, any>,
  ) => Promise<TContext> | TContext;

  /**
   * Optional synchronous hook run immediately before the render, with no await
   * point in between.
   *
   * This is where module-level state gets mutated: seeding a store the tree
   * reads from, swapping in this request's feature flags. Paired with `cleanup`
   * it is a window guaranteed not to overlap another render, which `setup`
   * cannot promise because it may await.
   *
   * @param context - The context object returned by the setup function
   *
   * @example
   * ```typescript
   * prepare: ({ props }) => {
   *   previousFlags = { ...FEATURE_FLAGS };
   *   Object.assign(FEATURE_FLAGS, props.feature_flags);
   * }
   * ```
   */
  prepare?: (context: TContext) => void;

  /**
   * Optional cleanup function called after rendering is complete, whether it
   * succeeded or threw. Restore anything `prepare` mutated here, and release
   * per-render resources (seal the style sheet, clear the query cache).
   * @param context - The context object returned by the setup function
   */
  cleanup?: (context: TContext) => Promise<void> | void;
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
     * @returns The rendered output containing head, body, optional body
     *   attributes, and optional hydration payload
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
 * Paths the renderer mounts its endpoints at. The gem's `config.render_path`
 * and `config.stream_path` must name the same paths, or Rails posts renders into
 * a 404 and falls back to client rendering.
 */
export type ServerPaths = {
  /** Blocking render endpoint. Defaults to `["/", "/static"]`. */
  render?: string | string[];
  /** Streaming render endpoint. Defaults to `"/stream"`. */
  stream?: string | string[];
  /** Health check endpoint. Defaults to `"/health"`. */
  health?: string | string[];
};
