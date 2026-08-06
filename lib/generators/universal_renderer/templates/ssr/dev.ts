// Development renderer entry. Loads the render config through a middleware-mode
// Vite server, so plugins and path aliases apply and edits need no rebuild.
//
// Production does not go through this file. See server.ts.
import "./globals";

const { startDevServer } = await import("universal-renderer/dev");

await startDevServer({ entry: "<%= frontend_dir %>/ssr/config.ts" });
