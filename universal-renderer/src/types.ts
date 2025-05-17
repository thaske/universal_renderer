import { Express, Request, Response } from "express";
import { Transform } from "node:stream";
import React from "react";
import { ViteDevServer } from "vite";

// --- User Application & Configuration ---

/**
 * Expected exports from the user's application entry file (appEntryPath).
 */
export interface UserAppModule {
  default?: React.ComponentType<{ url: string }>; // User's component
  // Users could export other components or functions if their setup callback needs them.
  [key: string]: any;
}

/**
 * Base result of the setup callback, containing the essential JSX
 * and allowing for arbitrary user-defined context.
 */
export interface AppSetupResultBase {
  jsx: React.ReactElement; // The main JSX element to be rendered
  [key: string]: any; // Allows users to pass through other context/instances they manage
}

/**
 * Core callbacks for application setup and cleanup, common to all rendering strategies.
 * @template TSetupResult The type of the result returned by setup and consumed by other callbacks.
 */
export interface CoreRenderCallbacks<
  TSetupResult extends AppSetupResultBase = AppSetupResultBase,
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
    props: Record<string, any>
  ) => Promise<TSetupResult> | TSetupResult;

  /**
   * Performs cleanup of resources after rendering.
   * This is the primary cleanup, called for both streaming and static rendering,
   * and is called on both successful renders and in error scenarios.
   * @param setupResult The result from the setup callback.
   */
  cleanup: (setupResult: TSetupResult) => void;
}

/**
 * Callbacks specific to the streaming rendering strategy.
 * These are used after the common `setup` and before the common `cleanup`.
 * @template TSetupResult The type of the result from the main `setup` callback.
 */
export interface StreamSpecificCallbacks<
  TSetupResult extends AppSetupResultBase = AppSetupResultBase,
> {
  /**
   * Optional: Called after setup and before streaming begins.
   * Use this to prepare context like meta tags or initial state that will be embedded in the HTML shell.
   * @param setupResult The result from the setup callback.
   * @returns A promise or direct result containing an object with optional 'meta' (string) and 'state' (JSON-serializable).
   */
  getShellContext?: (
    setupResult: TSetupResult
  ) => Promise<{ meta?: string; state?: any }> | { meta?: string; state?: any };

  /**
   * Optional: Called once before any part of the HTML document is written to the response for streaming.
   * Useful for setting custom headers or performing other initial setup on the response.
   * @param res The Express Response object.
   * @param setupResult The result from the setup callback.
   * @param shellContext The context object (containing meta and state) returned by getShellContext.
   */
  onResponseStart?: (
    res: Response,
    setupResult: TSetupResult,
    shellContext: { meta?: string; state?: any }
  ) => Promise<void> | void;

  /**
   * Optional: Creates a transform stream to pipe the React render stream through.
   * Useful for injecting styles (e.g., styled-components) or other stream transformations.
   * @param setupResult The result from the setup callback.
   * @returns A Transform stream or undefined.
   */
  createResponseTransformer?: (
    setupResult: TSetupResult
  ) => Transform | undefined;

  /**
   * Optional: Called after the main React content stream has finished,
   * but *before* the HTML parts containing the state script and the final closing HTML tags are written.
   * @param res The Express Response object.
   * @param setupResult The result from the setup callback.
   * @param shellContext The context object (containing meta and state) returned by getShellContext.
   */
  onBeforeWriteClosingHtml?: (
    res: Response,
    setupResult: TSetupResult,
    shellContext: { meta?: string; state?: any }
  ) => Promise<void> | void;

  /**
   * Optional: Called after the HTTP response has been fully sent and ended for a streamed response.
   * Useful for logging or final resource cleanup related to the response.
   * @param res The Express Response object.
   * @param setupResult The result from the setup callback.
   */
  onResponseEnd?: (
    res: Response,
    setupResult: TSetupResult
  ) => Promise<void> | void;
}

/**
 * Callbacks specific to the static HTML rendering strategy.
 * These are used after the common `setup` and before the common `cleanup`.
 * @template TSetupResult The type of the result from the main `setup` callback.
 */
export interface StaticSpecificCallbacks<
  TSetupResult extends AppSetupResultBase = AppSetupResultBase,
> {
  /**
   * Renders the application to a static string, including all necessary HTML and state.
   * This is called after the common `setup` and before the common `cleanup`.
   * The `jsx` for rendering is typically `setupResult.jsx` from the `setupResult`.
   * @param setupResult The result from the common `setup` callback.
   * @returns A promise or direct result containing the `StaticRenderResult` (meta, body, state).
   */
  render: (
    setupResult: TSetupResult
  ) => Promise<StaticRenderResult> | StaticRenderResult;
}

/**
 * Options for the main createSsrServer function.
 * @template TSetupResult The type of the setup result used by renderCallbacks.
 */
export interface CreateSsrServerOptions<
  TSetupResult extends AppSetupResultBase = AppSetupResultBase,
> {
  /** Callbacks for core application setup and cleanup. */
  coreCallbacks: CoreRenderCallbacks<TSetupResult>;

  /** Optional: Callbacks specific to the streaming rendering strategy. */
  streamCallbacks?: StreamSpecificCallbacks<TSetupResult>;

  /** Optional: Callbacks specific to the static HTML rendering strategy. */
  staticCallbacks?: StaticSpecificCallbacks<TSetupResult>;

  /** Base path for the application, if not running at root. Defaults to '/'. */
  basePath?: string;

  /**
   * Allows customization of the Express app instance before routes are added.
   * @param app The Express app instance.
   * @param vite The ViteDevServer instance.
   */
  configureExpressApp?: (
    app: Express,
    vite: ViteDevServer
  ) => void | Promise<void>;
}

// --- Internal Types for Server & Handlers ---

/**
 * Props typically received in the request body for rendering.
 */
export interface RenderRequestProps {
  _railsLayoutHtml?: string; // For streaming, layout provided by Rails
  query_data?: Array<{ key: string; data: any }>; // For React Query prehydration
  [key: string]: any; // Other props
}

/**
 * Data returned for a static render.
 */
export interface StaticRenderResult {
  meta: string;
  body: string;
  state: Record<string, any> | null;
}

/**
 * Represents the layout chunks after parsing the HTML template for streaming.
 */
export interface LayoutChunks {
  headAndInitialContentChunk: string;
  divCloseAndStateScriptChunk: string;
  finalHtmlChunk: string;
}

/**
 * Options specific to the stream pipeline setup.
 */
export interface StreamPipelineOptions<
  TSetupResult extends AppSetupResultBase = AppSetupResultBase,
> {
  jsx: React.ReactElement;
  res: Response;
  req: Request;
  coreCallbacks: CoreRenderCallbacks<TSetupResult>;
  streamCallbacks: StreamSpecificCallbacks<TSetupResult>;
  appSetupResult: TSetupResult;
  viteDevServer: ViteDevServer;
  htmlTemplate: string;
}
