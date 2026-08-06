// Browser globals for server rendering. **This is your code, grow it.**
//
// Scaffolded rather than shipped by the package, because which globals a graph
// touches is a property of that graph. Add what your render reaches for, and
// delete the file if it needs none.
//
// Why any of this is needed: `renderToString` runs no effects, but it does
// evaluate every module and every render body, and in a client-first app those
// touch the DOM (a singleton assigning `window.x`, a component reading
// `window.innerWidth`).
//
// The cost: defining `window` makes `typeof window === "undefined"` false for the
// whole process, which is how libraries detect a server. Prefer fixing the module
// that reaches for the DOM.
//
// Import order: a library that snapshots the environment at module-evaluation
// time loses its server API for good if it is imported after this file. Import
// those *above* this module, and reach the app graph through a dynamic
// `import()` (see server.ts).

const noop = () => undefined;
const g = globalThis as any;

const MARKER = "__ssrBrowserGlobals";

/** True when these globals are stubs rather than a real browser. */
export const isShimmed = (): boolean => g[MARKER] === true;

// Nothing about the device is knowable at render time. The client's first render
// must start from the same numbers, or React throws the server markup away.
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

// Deliberately forgetful: these globals live for the life of the process, so a
// backing store would carry one visitor's writes into the next visitor's render.
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
 * `setup`, or a stale location renders the wrong page.
 *
 * A no-op in a real browser. The marker lives on `globalThis`, so this is safe
 * from a module that gets evaluated more than once.
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
      // What the browser reports on first paint, so this hydrates cleanly.
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
    // Never invoked: real timers would fire after the render returns, outside the
    // prepare/cleanup window, and mutate the state `concurrency: 1` protects.
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
  //   - DOM constructors a library references at module scope. Inert classes are
  //     enough: `class DomElement {}; g.HTMLElement ??= DomElement;`
  //   - globals your Rails layout injects, e.g. `g.gon ??= {}`.
  //   - runtime workarounds, e.g. Bun's Error.captureStackTrace rejecting a
  //     non-Error `this`, which breaks follow-redirects under axios.

  return true;
}

installBrowserGlobals();
