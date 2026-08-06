export type Concurrency = number | "unbounded";

/**
 * Runs a task, waiting for a slot when the limiter is saturated.
 * Resolves/rejects with whatever the task does; the slot is always released.
 */
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Creates a concurrency limiter for render requests.
 *
 * SSR retrofitted onto a client-first app almost always has request-scoped
 * state living in module-level singletons — a store, a query client, a mutable
 * feature-flag object, a CSS-in-JS registry. Two renders interleaving through
 * those is not a slow page, it is one visitor's data rendered into another
 * visitor's HTML. So the default is `1`: renders are serialized, and
 * concurrency comes from running several renderer processes.
 *
 * Raise it, or pass `"unbounded"`, only once you know every module your render
 * touches is either stateless or per-request.
 */
export function createLimiter(concurrency: Concurrency = 1): Limiter {
  if (concurrency === "unbounded") {
    return (task) => task();
  }

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(
      `concurrency must be a positive integer or "unbounded", got ${String(concurrency)}`,
    );
  }

  let active = 0;
  const waiting: Array<() => void> = [];

  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;

    try {
      return await task();
    } finally {
      release();
    }
  };
}

/**
 * A limiter slot held explicitly, for callers whose critical section does not
 * fit inside a single function — streaming, where the section ends on a
 * response event rather than a return.
 */
export async function acquire(limiter: Limiter): Promise<() => void> {
  let release!: () => void;
  let acquired!: () => void;

  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });

  // The task keeps the slot until `release` is called; `ready` resolves as soon
  // as the slot is ours. Errors on `held` are impossible — it only ever
  // resolves — so this promise needs no rejection handling.
  void limiter(async () => {
    acquired();
    await held;
  });

  await ready;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
  };
}
