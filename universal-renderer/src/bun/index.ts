export { SSR_MARKERS } from "../constants";
export { createErrorHandler } from "./handlers/error";
export { createHealthHandler } from "./handlers/health";
export { createSSRHandler } from "./handlers/ssr";
export { createStreamHandler } from "./handlers/stream";
export { createServer, createServer as default } from "./server";
export type {
  BunErrorHandler,
  BunRequestHandler,
  BunServerOptions,
  BunSSRHandlerOptions,
  BunStreamHandlerOptions,
} from "./types";

// Re-export core types that are framework-agnostic
export type {
  BaseHandlerOptions,
  RenderOutput,
  SSRHandlerOptions,
  StreamHandlerOptions,
} from "../types";
