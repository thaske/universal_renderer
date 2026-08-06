/**
 * Side-effect entry: installs the browser globals shim with its defaults.
 *
 * ```ts
 * import "universal-renderer/shim/auto";   // must be the first import
 * ```
 *
 * Use `universal-renderer/shim` directly instead when your graph contains a
 * library that snapshots `typeof window` at module-evaluation time, or when you
 * need to configure the viewport — see that module's docs for the ordering
 * hazard, which is silent when you get it wrong.
 */
import { installBrowserGlobals } from "./index";

installBrowserGlobals();

export * from "./index";
