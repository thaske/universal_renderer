import type { Express, Request, Response } from "express";
import type { Transform } from "node:stream";
import type { ReactElement } from "react";
import type { ViteDevServer } from "vite";

// --- User Application & Configuration ---

/**
 * Base context object for rendering, containing the essential JSX
 * and allowing for arbitrary user-defined data.
 */
export interface RenderContextBase {
  jsx: ReactElement; // The main JSX element to be rendered
  [key: string]: any; // Allows users to pass through other context/instances they manage
}

/**
 * Core callbacks for application setup and cleanup, common to all rendering strategies.
 * @template TContext The type of the context passed between callbacks.
 */
export interface CoreRenderCallbacks<
  TContext extends RenderContextBase = RenderContextBase,
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
  onError?: (
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
  TContext extends RenderContextBase = RenderContextBase,
> {
  /**
   * Returns the React node to be rendered.
   * @param context The context object passed between callbacks.
   * @returns The React node to be rendered.
   */
  getReactNode: (context: TContext) => React.ReactNode;

  /**
   * Optional: Called once before any part of the HTML document is written to the response for streaming.
   * Useful for setting custom headers or performing other initial setup on the response.
   * @param res The Express Response object.
   * @param context The context object passed between callbacks.
   */
  onResponseStart?: (res: Response, context: TContext) => Promise<void> | void;

  /**
   * Optional: Called after the meta tag has been written to the response.
   * @param res The Express Response object.
   * @param context The context object passed between callbacks.
   */
  onWriteMeta?: (res: Response, context: TContext) => Promise<void> | void;

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
 * Callbacks specific to the static HTML rendering strategy.
 * These are used after the common `setup` and before the common `cleanup`.
 * @template TContext The type of the context passed between callbacks.
 * @template TRenderOutput The type of the output from the static render callback.
 */
export interface StaticSpecificCallbacks<
  TContext extends RenderContextBase = RenderContextBase,
  TRenderOutput extends Record<string, any> = Record<string, any>,
> {
  /**
   * Renders the application to a static object where keys and values are strings.
   * This is called after the common \`setup\` and before the common \`cleanup\`.
   * The \`jsx\` for rendering is typically available in the context object.
   * @param context The context object passed between callbacks.
   * @returns A promise or direct result containing the statically rendered HTML parts.
   */
  render: (context: TContext) => Promise<TRenderOutput> | TRenderOutput;
}

/**
 * Options for the main createSsrServer function.
 * @template TContext The type of the context used by render callbacks.
 * @template TRenderOutput The type of the output from the static render callback.
 */
export interface CreateSsrServerOptions<
  TContext extends RenderContextBase = RenderContextBase,
  TRenderOutput extends Record<string, any> = Record<string, any>,
> {
  /** The Vite dev server instance. */
  vite: ViteDevServer;

  /** Callbacks for core application setup and cleanup. */
  coreCallbacks: CoreRenderCallbacks<TContext>;

  /** Optional: Callbacks specific to the streaming rendering strategy. */
  streamCallbacks?: StreamSpecificCallbacks<TContext>;

  /** Optional: Callbacks specific to the static HTML rendering strategy. */
  staticCallbacks?: StaticSpecificCallbacks<TContext, TRenderOutput>;

  /** Base path for the application, if not running at root. Defaults to '/'. */
  basePath?: string;

  /**
   * Allows customization of the Express app instance before routes are added.
   * @param app The Express app instance.
   * @param vite The ViteDevServer instance.
   */
  configureExpressApp?: (
    app: Express,
    vite: ViteDevServer,
  ) => void | Promise<void>;
}

// --- Internal Types for Server & Handlers ---

/**
 * Props typically received in the request body for rendering.
 */
export interface RenderRequestProps {
  _railsLayoutHtml?: string; // For streaming, layout provided by Rails
  [key: string]: any; // Other props
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
 * Options specific to the stream pipeline setup.
 */
export interface StreamPipelineOptions<
  TContext extends RenderContextBase = RenderContextBase,
> {
  jsx: React.ReactElement;
  res: Response;
  req: Request;
  coreCallbacks: CoreRenderCallbacks<TContext>;
  streamCallbacks: StreamSpecificCallbacks<TContext>;
  renderContext: TContext;
  viteDevServer: ViteDevServer;
  htmlTemplate: string;
}
