// App-owned browser stubs for SSR. Add only what your graph needs. Defining
// `window` makes browser-detection checks false process-wide; prefer fixing DOM
// access in the app where possible.

const noop = () => undefined;
const g = globalThis as any;
const MARKER = "__ssrBrowserGlobals";

export const isShimmed = (): boolean => g[MARKER] === true;
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

  return true;
}

installBrowserGlobals();
