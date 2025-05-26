import type { RenderOutput } from "./types";

/**
 * WebSocket message structure for communication between Ruby gem and NPM package
 */
export interface WebSocketMessage {
  id: string;
  type:
    | "ssr_request"
    | "ssr_response"
    | "stream_request"
    | "stream_start"
    | "stream_chunk"
    | "stream_end"
    | "health_check"
    | "health_response"
    | "error";
  payload: any;
}

/**
 * Connection metadata stored with each WebSocket connection
 */
export interface WebSocketConnection<TContext = any> {
  id: string;
  connectedAt: number;
  context?: TContext;
}

/**
 * Stream writer interface for sending chunks via WebSocket
 */
export interface WebSocketStreamWriter {
  write: (chunk: string) => void;
  end: () => void;
}

/**
 * Streaming callbacks for WebSocket-based streaming
 */
export interface WebSocketStreamCallbacks<TContext> {
  onStream: (
    context: TContext,
    writer: WebSocketStreamWriter,
    template?: string,
  ) => Promise<void>;
}

/**
 * Configuration options for the WebSocket SSR server
 */
export interface WebSocketServerOptions<
  TContext extends Record<string, any> = Record<string, any>,
> {
  /**
   * Setup function called before rendering to prepare the context
   */
  setup?: (url: string, props: any) => Promise<TContext> | TContext;

  /**
   * Main render function that generates the SSR output
   */
  render: (context: TContext) => Promise<RenderOutput> | RenderOutput;

  /**
   * Cleanup function called after rendering to dispose of resources
   */
  cleanup?: (context: TContext) => void;

  /**
   * Streaming callbacks for handling streaming SSR
   */
  streamCallbacks?: WebSocketStreamCallbacks<TContext>;

  /**
   * Port to listen on (default: 3000)
   */
  port?: number;

  /**
   * Called when a new WebSocket connection is established
   */
  onConnection?: (connection: WebSocketConnection<TContext>) => void;

  /**
   * Called when a WebSocket connection is closed
   */
  onDisconnection?: (
    connection: WebSocketConnection<TContext>,
    code: number,
    message: string,
  ) => void;

  /**
   * Called when a WebSocket error occurs
   */
  onError?: (connection: WebSocketConnection<TContext>, error: Error) => void;
}

/**
 * SSR request payload structure
 */
export interface SSRRequestPayload {
  url: string;
  props?: Record<string, any>;
}

/**
 * Stream request payload structure
 */
export interface StreamRequestPayload extends SSRRequestPayload {
  template?: string;
}

/**
 * Error payload structure
 */
export interface ErrorPayload {
  message: string;
  code: string;
}

/**
 * Health check response payload
 */
export interface HealthResponsePayload {
  status: "ok" | "error";
  timestamp: number;
}
