// Production renderer entry.
//
// Everything is bundled ahead of time by vite.config.ssr.mts, so this process
// starts an HTTP server and renders from the compiled graph — no Vite server and
// no per-request module transform, which is where nearly all of the development
// SSR latency lives. Development uses dev.ts instead.
// Browser globals first. This is app code, not something the package provides —
// see globals.ts for why, and delete it if your graph does not need it.
import "./globals";

// Dynamic imports, not static ones, and that is load-bearing. The app graph
// touches browser globals while its modules evaluate, and static imports are all
// evaluated before the entry body runs — so the import above would land too late.
//
// If your graph contains a library that snapshots `typeof window` at module
// scope (aphrodite's StyleSheetServer is the classic case), import it statically
// *above* `./globals`. Relying on import order alone is silently undone the
// first time a formatter re-sorts the imports, so leave a comment saying so.
const { default: config } = await import("./config");
const { startServer } = await import("universal-renderer");

await startServer({
  ...config,
  // Serialized on purpose. See config.ts.
  concurrency: 1,
  // The other half of that decision: with one slot, a render that never settles
  // holds it forever and the renderer is done. This answers the caller 504 and
  // makes /health report 503, which is what bin/web watches to restart it.
  renderTimeout: 10_000,
});
