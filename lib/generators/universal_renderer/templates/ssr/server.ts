// Production renderer entry.
//
// Everything is bundled ahead of time by vite.config.ssr.mts, so this process
// starts an HTTP server and renders from the compiled graph — no Vite server and
// no per-request module transform, which is where nearly all of the development
// SSR latency lives. Development uses dev.ts instead.
import "universal-renderer/shim/auto";

// Dynamic imports, not static ones, and that is load-bearing. The app graph
// touches browser globals while its modules evaluate, and static imports are all
// evaluated before the entry body runs — so the shim above would land too late.
//
// If your graph contains a library that snapshots `typeof window` at module
// scope (aphrodite's StyleSheetServer is the classic case), import it *statically
// above* the shim and switch to `universal-renderer/shim`'s explicit
// installBrowserGlobals(). Relying on import order alone is silently undone the
// first time a formatter re-sorts the imports.
const { default: config } = await import("./config");
const { startServer } = await import("universal-renderer");

await startServer({
  ...config,
  // Serialized on purpose. See config.ts.
  concurrency: 1,
});
