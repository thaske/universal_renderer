// Development renderer entry.
//
// The app graph relies on Vite plugins and tsconfig path aliases, so in
// development the render config is loaded through a middleware-mode Vite server:
// the same transforms that power the client dev server apply, and edits are
// picked up without a rebuild.
//
// Production does NOT go through this file — see server.ts, which runs the
// prebuilt bundle. A Vite dev server transforming modules per render is the
// single largest cost in the SSR path and has no place in production.
import "universal-renderer/shim/auto";

const { startDevServer } = await import("universal-renderer/dev");

await startDevServer({ entry: "<%= frontend_dir %>/ssr/config.ts" });
