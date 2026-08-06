// Browser globals for server rendering. **This is your code — grow it.**
//
// It is scaffolded here rather than shipped by the package on purpose. Which
// globals a graph touches is a property of that graph, not of SSR, so a library
// version would be a pile of guesses: too small to boot your app and too large
// to reason about. Start from this, add what your own render actually reaches
// for, and delete the file entirely if it turns out you need none of it.
//
// ## Why anything is needed at all
//
// `renderToString` does not run effects, so `useEffect` is safe. It does still
// evaluate every module in the graph and every render body, and both of those
// routinely touch the DOM in an app that was written client-first:
//
//   - a singleton doing `window.myThing = ...` at module scope
//   - a component reading `window.innerWidth` or `localStorage` while rendering
//
// Neither survives under Node, and neither is React's problem to solve.
//
// ## The cost, so you make it deliberately
//
// Defining `window` makes `typeof window === "undefined"` false for the whole
// process. That check is the standard way libraries detect a server, so any
// library that uses it now takes its browser path. Prefer fixing the module
// that reaches for the DOM; reach for this when you cannot.
//
// ## Import order
//
// A library that snapshots the environment at module-evaluation time —
// `var Server = typeof window !== "undefined" ? null : {...}` — loses its server
// API for good if it is imported after this file. Import those *above* the
// import of this module, and reach the rest of the app graph through a dynamic
// `import()` (see server.ts).

const noop = () => undefined;
const g = globalThis as any;

const MARKER = "__ssrBrowserGlobals";

/** True when these globals are stubs rather than a real browser. */
export const isShimmed = (): boolean => g[MARKER] === true;

// Nothing about the real device is knowable at render time. Pick a viewport and
// have the client's first render start from the same numbers, or every
// width-dependent branch disagrees and React throws the server markup away.
export const SSR_VIEWPORT = { width: 1024, height: 768 };

const makeLocation = (value: string) => {
  const url = new URL(value);
  return {
    href: url.href,
    protocol: url.protocol,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    origin: url.origin,
    assign: noop,
    reload: noop,
    replace: noop,
    toString: () => url.href,
  };
};

// Deliberately forgetful. These globals live for the life of the *process*, not
// the request, so a backing store would carry one visitor's writes into the next
// visitor's render — and serializing renders does not help, because the value
// persists after the render that wrote it.
const makeStorage = (): Storage =>
  ({
    length: 0,
    clear: noop,
    getItem: () => null,
    key: () => null,
    removeItem: noop,
    setItem: noop,
  }) as unknown as Storage;

const makeElement = (): any => ({
  style: {},
  dataset: {},
  children: [],
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop,
  removeAttribute: noop,
  getAttribute: () => null,
  appendChild: noop,
  removeChild: noop,
  addEventListener: noop,
  removeEventListener: noop,
  querySelector: () => null,
  querySelectorAll: () => [],
  contains: () => false,
});

/**
 * Points the stub `location` at the URL being rendered. Call it at the top of
 * `setup`: code that reads `window.location.pathname` during render is common,
 * and a stale location renders the wrong page.
 *
 * A no-op in a real browser, and safe to call from a module evaluated more than
 * once (the entry and Vite's SSR graph each hold a copy) — the marker lives on
 * `globalThis`, which every copy shares.
 */
export function setBrowserLocation(url: string): void {
  if (!isShimmed()) return;

  const location = makeLocation(url);
  g.window.location = location;
  g.location = location;
  if (g.document) g.document.URL = location.href;
}

export function installBrowserGlobals(): boolean {
  if (isShimmed()) return false;
  if (typeof g.window !== "undefined" && typeof g.document !== "undefined") {
    return false;
  }

  g[MARKER] = true;

  const location = makeLocation("http://localhost:3000/");

  const win: any = {
    location,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    navigator: { userAgent: "ssr", language: "en-US", languages: ["en-US"] },
    document: {
      readyState: "complete",
      title: "",
      cookie: "",
      URL: location.href,
      documentElement: makeElement(),
      body: makeElement(),
      head: makeElement(),
      // Consistent with each other, and with what the browser reports on first
      // paint, so a visibility-dependent branch hydrates cleanly.
      hidden: false,
      visibilityState: "visible",
      createElement: () => makeElement(),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: noop,
      removeEventListener: noop,
    },
    history: { pushState: noop, replaceState: noop, back: noop, go: noop },
    matchMedia: (media: string) => ({
      matches: false,
      media,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
    }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    // Never invoked. Backing these with real timers schedules work that fires
    // *after* the render returns, outside the prepare/cleanup window, where it
    // mutates the module state `concurrency: 1` exists to protect.
    requestAnimationFrame: (_cb: () => void) => 0,
    cancelAnimationFrame: noop,
    innerWidth: SSR_VIEWPORT.width,
    innerHeight: SSR_VIEWPORT.height,
    scrollTo: noop,
    addEventListener: noop,
    removeEventListener: noop,
  };

  win.window = win;
  win.self = win;
  win.top = win;

  g.window = win;
  for (const key of [
    "document",
    "navigator",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
    "matchMedia",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "innerWidth",
    "innerHeight",
  ]) {
    if (!(key in g)) g[key] = win[key];
  }

  // Add your own here. Common cases:
  //
  //   - DOM constructors a library references at module scope, usually through
  //     a `PropTypes.instanceOf(HTMLElement)` guard. Inert classes are enough:
  //       class DomElement {}
  //       g.HTMLElement ??= DomElement;
  //   - globals your Rails layout injects, e.g. `g.gon ??= {}`.
  //   - runtime workarounds, e.g. Bun's Error.captureStackTrace rejecting a
  //     non-Error `this`, which breaks follow-redirects under axios.

  return true;
}

installBrowserGlobals();
