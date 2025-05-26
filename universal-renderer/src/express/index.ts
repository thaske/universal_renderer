export { SSR_MARKERS } from "../core/constants";
export {
  createErrorHandler,
  createHealthHandler,
  createSSRHandler,
  createStreamHandler,
} from "./handlers";
export { createServer, createServer as default } from "./server";
export type {
  ExpressBaseHandlerOptions,
  ExpressSSRHandlerOptions,
  ExpressServerOptions,
  ExpressStreamHandlerOptions,
} from "./types";

// Re-export core types that are framework-agnostic
export type {
  BaseHandlerOptions,
  RenderOutput,
  SSRHandlerOptions,
  StreamHandlerOptions,
} from "../core/types";
