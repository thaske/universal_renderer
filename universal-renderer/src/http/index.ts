import * as bunImpl from "./bun/index";
import * as expressImpl from "./express/index";

// Select implementation based on runtime (Bun vs Node)
const impl = typeof Bun !== "undefined" ? bunImpl : expressImpl;

export const SSR_MARKERS = impl.SSR_MARKERS;
export const createErrorHandler = impl.createErrorHandler;
export const createHealthHandler = impl.createHealthHandler;
export const createSSRHandler = impl.createSSRHandler;
export const createStreamHandler = impl.createStreamHandler;
export const createServer = impl.createServer;
export const startCluster = (impl as any).startCluster as typeof expressImpl.startCluster | undefined;
export default impl.createServer;

// Re-export shared types (they come from the top-level types module)
export type {
  BaseHandlerOptions,
  RenderOutput,
  SSRHandlerOptions,
  StreamHandlerOptions
} from "../types";
