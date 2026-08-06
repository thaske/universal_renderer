// Production renderer entry. Renders from the bundle vite.config.ssr.mts builds,
// with no Vite server and no per-request module transform. Development uses
// dev.ts instead.
//
// Browser globals first. See globals.ts, and delete it if your graph needs none.
import "./globals";

// Dynamic, not static: static imports all evaluate before the entry body runs, so
// the import above would land after the app graph has already touched globals.
//
// A library that snapshots `typeof window` at module scope must be imported
// statically *above* `./globals`. Leave a comment saying so, or a formatter
// re-sorting the imports undoes it.
const { default: config } = await import("./config");
const { startServer } = await import("universal-renderer");

await startServer({
  ...config,
  // Serialized on purpose. See config.ts.
  concurrency: 1,
  // With one slot, a render that never settles holds it forever. This answers the
  // caller 504 and makes /health report 503, which bin/web watches.
  renderTimeout: 10_000,
});
