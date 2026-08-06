/**
 * Inert browser globals for server rendering.
 *
 * `renderToString` never runs effects, but it does evaluate every module in the
 * graph and every render body. A React app that was written client-first will
 * reach for `window`, `document`, `localStorage`, or `navigator` in both places
 * — a singleton assigning `window.myThing` at module scope, a component reading
 * `window.innerWidth` while rendering — and none of that survives under Node.
 *
 * These stubs do nothing and remember nothing. The point is to let the graph
 * load and render, not to emulate a browser: anything that actually needs the
 * DOM belongs in an effect, where SSR will not reach it.
 *
 * ## Import order matters
 *
 * Some libraries decide once, at module-evaluation time, whether they are in a
 * browser:
 *
 * ```js
 * var StyleSheetServer = typeof window !== "undefined" ? null : { ... };
 * ```
 *
 * A library like that, imported *after* the shim, loses its server API for good.
 * Import such libraries first, then install the shim, then reach the app graph
 * through a dynamic `import()` — static imports in the entry are all evaluated
 * before the entry body runs, so shims installed in the body would land too
 * late:
 *
 * ```ts
 * import "aphrodite";                    // must see a window-less environment
 * import { installBrowserGlobals } from "universal-renderer/shim";
 *
 * installBrowserGlobals();
 *
 * const { default: config } = await import("./config");
 * ```
 *
 * If nothing in your graph has that hazard, `import "universal-renderer/shim/auto"`
 * as the first line of the entry is equivalent and shorter.
 */

export type Viewport = { width: number; height: number };

export type ShimOptions = {
  /**
   * Viewport the server renders against, reported through `innerWidth`,
   * `screen`, and friends.
   *
   * Nothing about the real device is knowable at render time, so pick one and
   * have the client's first render start from the same numbers — otherwise every
   * width-dependent branch disagrees and React throws the server markup away.
   * Defaults to 1024×768.
   */
  viewport?: Viewport;

  /** Initial `location`. Defaults to `http://localhost:3000/`. */
  url?: string;

  /**
   * Extra globals to define, for app-specific or vendor globals the graph reads
   * at module scope. Existing globals are never overwritten.
   */
  globals?: Record<string, unknown>;
};

const MARKER = "__universalRendererBrowserShim";
const DEFAULT_VIEWPORT: Viewport = { width: 1024, height: 768 };
const DEFAULT_URL = "http://localhost:3000/";

const noop = () => undefined;

const anyGlobal = () => globalThis as any;

/** True when the shim installed these globals, rather than a real browser. */
export function isShimmed(): boolean {
  return anyGlobal()[MARKER] === true;
}

let viewport: Viewport = DEFAULT_VIEWPORT;

/** The viewport the shim is reporting. */
export function getViewport(): Viewport {
  return viewport;
}

/**
 * Updates the reported viewport. Use the same numbers on the client's first
 * render (see {@link ShimOptions.viewport}).
 */
export function setViewport(next: Viewport): void {
  viewport = next;
  if (!isShimmed()) return;

  const g = anyGlobal();
  const win = g.window;
  Object.assign(win, {
    innerWidth: next.width,
    innerHeight: next.height,
    outerWidth: next.width,
    outerHeight: next.height,
  });
  Object.assign(win.screen, {
    width: next.width,
    height: next.height,
    availWidth: next.width,
    availHeight: next.height,
  });
  g.innerWidth = next.width;
  g.innerHeight = next.height;
}

function makeStorage(): Storage {
  const backing = new Map<string, string>();
  return {
    get length() {
      return backing.size;
    },
    clear: () => backing.clear(),
    getItem: (key: string) => backing.get(key) ?? null,
    key: (index: number) => Array.from(backing.keys())[index] ?? null,
    removeItem: (key: string) => void backing.delete(key),
    setItem: (key: string, value: string) =>
      void backing.set(key, String(value)),
  } as unknown as Storage;
}

function makeElement(): any {
  const el: any = {
    style: {},
    dataset: {},
    // CSS-in-JS libraries inject through a real <style> element's CSSOM, so the
    // stub needs an inert sheet to write into.
    sheet: { cssRules: [], insertRule: () => 0, deleteRule: noop },
    children: [],
    attributes: {},
    classList: {
      add: noop,
      remove: noop,
      toggle: noop,
      contains: () => false,
    },
    setAttribute: noop,
    removeAttribute: noop,
    getAttribute: () => null,
    appendChild: noop,
    removeChild: noop,
    insertBefore: noop,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => false,
    focus: noop,
    blur: noop,
    click: noop,
    scrollIntoView: noop,
    getBoundingClientRect: () => ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
    }),
    contains: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    matches: () => false,
    closest: () => null,
    cloneNode: () => makeElement(),
  };
  return el;
}

function makeLocation(value: string) {
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
    ancestorOrigins: [],
    assign: noop,
    reload: noop,
    replace: noop,
    toString: () => url.href,
  };
}

/**
 * Points the shimmed `location` at the URL being rendered. Call it at the top of
 * `setup` — code that reads `window.location.pathname` during render is common,
 * and a stale location renders the wrong page.
 *
 * A no-op in a real browser, and safe to call from a module that is evaluated
 * more than once (Vite's SSR graph and the entry can each hold a copy); the
 * marker lives on `globalThis`, which every copy shares.
 */
export function setBrowserLocation(value: string): void {
  if (!isShimmed()) return;

  const g = anyGlobal();
  const location = makeLocation(value);

  g.window.location = location;
  g.location = location;
  if (g.document) g.document.URL = location.href;
}

function makeDomConstructors() {
  class DomNode {}
  class DomElement extends DomNode {
    style: any = {};
  }
  class DomHTMLElement extends DomElement {}
  class DomDocument extends DomNode {}
  class DomWindow {}
  class DomEvent {
    preventDefault = noop;
    stopPropagation = noop;
    stopImmediatePropagation = noop;
  }

  // Libraries reference these at module-evaluation time — `PropTypes.instanceOf(
  // HTMLElement)` guards are the usual culprit — but never meaningfully
  // instantiate them during a server render, so inert classes are enough.
  return {
    Node: DomNode,
    Element: DomElement,
    HTMLElement: DomHTMLElement,
    HTMLDocument: DomDocument,
    Document: DomDocument,
    Window: DomWindow,
    Event: DomEvent,
    CustomEvent: DomEvent,
    MouseEvent: DomEvent,
    KeyboardEvent: DomEvent,
    PointerEvent: DomEvent,
    TouchEvent: DomEvent,
    FocusEvent: DomEvent,
    AnimationEvent: DomEvent,
    TransitionEvent: DomEvent,
    SVGElement: DomElement,
    Text: DomNode,
    Comment: DomNode,
  };
}

function makeObserver(withRecords = true) {
  return function Observer(this: any) {
    this.observe = noop;
    this.unobserve = noop;
    this.disconnect = noop;
    if (withRecords) this.takeRecords = () => [];
  };
}

function makeWindow(url: string) {
  const location = makeLocation(url);

  return {
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    navigator: {
      userAgent: "universal-renderer-ssr",
      platform: "node",
      language: "en-US",
      languages: ["en-US"],
      cookieEnabled: false,
      doNotTrack: null,
      onLine: true,
      vendor: "",
      appVersion: "",
      maxTouchPoints: 0,
      hardwareConcurrency: 4,
      deviceMemory: 8,
      sendBeacon: () => true,
      mediaDevices: {
        getUserMedia: noop,
        enumerateDevices: () => Promise.resolve([]),
      },
      clipboard: { writeText: () => Promise.resolve() },
    },
    location,
    history: {
      length: 0,
      state: undefined,
      pushState: noop,
      replaceState: noop,
      back: noop,
      forward: noop,
      go: noop,
    },
    document: {
      readyState: "complete",
      title: "",
      referrer: "",
      cookie: "",
      URL: location.href,
      documentElement: makeElement(),
      body: makeElement(),
      head: makeElement(),
      currentScript: null,
      hidden: false,
      visibilityState: "prerender",
      createElement: () => makeElement(),
      createElementNS: () => makeElement(),
      createTextNode: () => makeElement(),
      createDocumentFragment: () => makeElement(),
      getElementById: () => null,
      getElementsByClassName: () => [],
      getElementsByTagName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    },
    matchMedia: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
    cancelAnimationFrame: (id: any) => clearTimeout(id),
    requestIdleCallback: (cb: () => void) => setTimeout(cb, 0),
    cancelIdleCallback: (id: any) => clearTimeout(id),
    innerWidth: viewport.width,
    innerHeight: viewport.height,
    outerWidth: viewport.width,
    outerHeight: viewport.height,
    devicePixelRatio: 1,
    screenX: 0,
    screenY: 0,
    scrollX: 0,
    scrollY: 0,
    pageXOffset: 0,
    pageYOffset: 0,
    screen: {
      width: viewport.width,
      height: viewport.height,
      availWidth: viewport.width,
      availHeight: viewport.height,
      colorDepth: 24,
      pixelDepth: 24,
      orientation: { type: "landscape-primary", angle: 0 },
    },
    scrollTo: noop,
    scroll: noop,
    open: () => null,
    close: noop,
    blur: noop,
    focus: noop,
    print: noop,
    stop: noop,
    postMessage: noop,
    getSelection: () => null,
    confirm: () => true,
    alert: noop,
    prompt: () => null,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => false,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch,
    ResizeObserver: makeObserver(false),
    IntersectionObserver: makeObserver(),
    MutationObserver: makeObserver(),
  } as any;
}

/**
 * Installs the shim, unless real browser globals are already present or the shim
 * has already run. Idempotent.
 *
 * @returns true if globals were installed by this call.
 */
export function installBrowserGlobals(options: ShimOptions = {}): boolean {
  const g = anyGlobal();

  if (isShimmed()) return false;
  if (typeof g.window !== "undefined" && typeof g.document !== "undefined") {
    return false;
  }

  if (options.viewport) viewport = options.viewport;

  g[MARKER] = true;

  const win = makeWindow(options.url ?? DEFAULT_URL);

  for (const [key, value] of Object.entries(makeDomConstructors())) {
    if (!(key in g)) g[key] = value;
  }

  for (const [key, value] of Object.entries(options.globals ?? {})) {
    if (!(key in g)) g[key] = value;
  }

  if (!("XMLHttpRequest" in g)) {
    g.XMLHttpRequest = function XMLHttpRequest(this: any) {
      Object.assign(this, {
        readyState: 0,
        status: 0,
        statusText: "",
        responseText: "",
        response: null,
        responseType: "",
        timeout: 0,
        withCredentials: false,
        onreadystatechange: null,
        onload: null,
        onerror: null,
        open: noop,
        send: noop,
        abort: noop,
        setRequestHeader: noop,
        getResponseHeader: () => null,
        getAllResponseHeaders: () => "",
        addEventListener: noop,
        removeEventListener: noop,
        upload: { addEventListener: noop },
      });
    };
  }

  // `window` behaves as the global object so module-scope references like
  // `window.location` and `window.localStorage` resolve.
  Object.defineProperty(g, "window", {
    value: win,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  win.window = win;
  win.globalThis = g;
  win.self = win;
  win.top = win;
  win.parent = win;

  // The same handful of globals are read both bare and off `window`.
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
    "requestIdleCallback",
    "cancelIdleCallback",
    "innerWidth",
    "innerHeight",
    "devicePixelRatio",
    "scrollTo",
    "ResizeObserver",
    "IntersectionObserver",
    "MutationObserver",
  ]) {
    if (!(key in win)) continue;

    try {
      Object.defineProperty(g, key, {
        value: win[key],
        writable: true,
        configurable: true,
      });
    } catch {
      // Some runtimes expose a few of these as non-configurable. Reading them
      // off `window` still works, which is the common case.
    }
  }

  return true;
}
