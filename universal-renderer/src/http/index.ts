export { SSR_MARKERS } from "./express/index";
export {
  createErrorHandler,
  createHealthHandler,
  createSSRHandler,
  createStreamHandler,
  createServer,
  startCluster,
} from "./express/index";
export { createServer as default } from "./express/index";

// Re-export shared types (they come from the top-level types module)
export type {
  BaseHandlerOptions,
  RenderOutput,
  SSRHandlerOptions,
  StreamHandlerOptions
} from "../types";
