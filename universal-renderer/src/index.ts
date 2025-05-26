// Export shared constants and types
export { SSR_MARKERS } from "./core/constants";
export type {
  BaseHandlerOptions,
  RenderOutput,
  SSRHandlerOptions,
  StreamHandlerOptions,
} from "./core/types";
export { createServer } from "./server";

// Note: Framework-specific exports are available at subpaths:
// - 'universal-renderer/express' for Express.js integration
// - 'universal-renderer/hono' for Hono integration
