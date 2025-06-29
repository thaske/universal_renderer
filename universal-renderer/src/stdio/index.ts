// Unified entry that picks the correct stdio implementation at runtime.
// Bundlers/tree-shakers will include both branches but only one runs.
// Node does not define global Bun, while Bun does – this is the simplest
// runtime test.

import * as bunImpl from "./bun/index";
import * as nodeImpl from "./node/index";

// Detect environment (Bun vs Node)
const impl = typeof Bun !== "undefined" ? bunImpl : nodeImpl;

export const createRenderer = impl.createRenderer as typeof bunImpl.createRenderer;

// Legacy alias for compatibility
export const createStdioRenderer = impl.createStdioRenderer as typeof bunImpl.createStdioRenderer;

// If consumers want to inspect which backend got chosen
export const _selectedBackend = typeof Bun !== "undefined" ? "bun" : "node";
