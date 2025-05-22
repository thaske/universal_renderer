import type { Express, Response } from "express";
import type { Transform } from "node:stream";

// --- User Application & Configuration ---

/**
 * Core callbacks for application setup and cleanup, common to all rendering strategies.
 * @template TContext The type of the context passed between callbacks.
 */
export interface BaseCallbacks<
  TContext extends Record<string, any> = Record<string, any>,
  TRenderOutput extends Record<string, any> = Record<string, any>,
> {
  /**
   * Sets up the main application component with necessary providers (Router, Helmet, QueryClient, etc.).
   * This is the primary setup, run for both streaming and static rendering.
   * @param props Props passed from the client/request (e.g., for initial state).
   * @param requestUrl The URL of the current request.
   * @returns A promise or direct result containing the JSX to render and any context/instances.
   */
  setup: (
    requestUrl: string,
    props: Record<string, any>,
  ) => Promise<TContext> | TContext;

  /**
   * Optional: Provides custom HTML content to be displayed when an error occurs during rendering.
   * This content will be injected into the main body of the HTML response.
   * If not provided, a generic error message will be displayed.
   * @param error The error that occurred.
   * @param context The context object, if available.
   * @returns A promise or direct string containing the HTML error content.
   */
  getErrorContent?: (
    error: unknown,
    context?: TContext,
  ) => Promise<string> | string;

  /**
   * Renders the application to a static object where keys and values are strings.
   * The \`jsx\` for rendering is typically available in the context object.
   * @param context The context object passed between callbacks.
   * @returns A promise or direct result containing the statically rendered HTML parts.
   */
  render: (context: TContext) => Promise<TRenderOutput> | TRenderOutput;

  /**
   * Performs cleanup of resources after rendering.
   * This is the primary cleanup, called for both streaming and static rendering,
   * and is called on both successful renders and in error scenarios.
   * @param context The context object passed between callbacks.
   */
  cleanup: (context: TContext) => void;

  /**
   * Called when an error occurs during rendering.
   * @param error The error that occurred.
   * @param errorContext A string describing the context of the error.
   * @param context The context object passed between callbacks.
   */
  error?: (
    error: Error | unknown,
    context?: TContext,
    errorContext?: string,
  ) => void;
}

/**
 * Callbacks specific to the streaming rendering strategy.
 * These are used after the common `setup` and before the common `cleanup`.
 * @template TContext The type of the context passed between callbacks.
 */
export interface StreamSpecificCallbacks<
  TContext extends Record<string, any> = Record<string, any>,
> {
  /**
   * Returns the React node to be rendered.
   * @param context The context object passed between callbacks.
   * @returns The React node to be rendered.
   */
  getReactNode: (context: TContext) => React.ReactNode;

  /**
   * Returns the meta tags to be written to the head of the HTML document.
   * @param res The Express Response object.
   * @param context The context object passed between callbacks.
   * @returns The meta tags to be written to the head of the HTML document.
   */
  getMetaTags?: (context: TContext) => Promise<string> | string;

  /**
   * Optional: Creates a transform stream to pipe the application's render stream through.
   * This allows for modifications to the rendered HTML (e.g., injecting styles for styled-components)
   * before it is sent to the client.
   * @param context The context object passed between callbacks.
   * @returns A Transform stream or undefined.
   */
  createRenderStreamTransformer?: (context: TContext) => Transform | undefined;

  /**
   * Optional: Called after the main application content stream has finished,
   * but *before* the HTML parts containing any state scripts and the final closing HTML tags are written.
   * @param res The Express Response object.
   * @param context The context object passed between callbacks.
   */
  onBeforeWriteClosingHtml?: (
    res: Response,
    context: TContext,
  ) => Promise<void> | void;

  /**
   * Optional: Called after the HTTP response has been fully sent and ended for a streamed response.
   * Useful for logging or final resource cleanup related to the response.
   * @param res The Express Response object.
   * @param context The context object passed between callbacks.
   */
  onResponseEnd?: (res: Response, context: TContext) => Promise<void> | void;
}

/**
 * Options for the main createSsrServer function.
 * @template TContext The type of the context used by render callbacks.
 * @template TRenderOutput The type of the output from the static render callback.
 */
export interface CreateSsrServerOptions<
  TContext extends Record<string, any> = Record<string, any>,
  TRenderOutput extends Record<string, any> = Record<string, any>,
> {
  /** Callbacks for application setup and cleanup. */
  callbacks: BaseCallbacks<TContext, TRenderOutput>;

  /** Optional: Callbacks specific to the streaming rendering strategy. */
  streamCallbacks?: StreamSpecificCallbacks<TContext>;

  /** Base path for the application, if not running at root. Defaults to '/'. */
  basePath?: string;

  /**
   * Allows customization of the Express app instance before routes are added.
   * @param app The Express app instance.
   */
  middleware?: (app: Express) => void | Promise<void>;
}

// --- Internal Types for Server & Handlers ---

/**
 * Props typically received in the request body for rendering.
 */
export interface RenderRequestProps {
  [key: string]: any;
}

/**
 * Represents the layout chunks after parsing the HTML template for streaming.
 */
export interface LayoutChunks {
  beforeMetaChunk: string;
  afterMetaAndBeforeBodyChunk: string;
  afterBodyChunk: string;
}

/**
 * SSR Markers for HTML template injection during streaming.
 */
export enum SSR_MARKERS {
  META = "<!-- SSR_META -->",
  BODY = "<!-- SSR_BODY -->",
}
