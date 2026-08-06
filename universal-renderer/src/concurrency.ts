export type Concurrency = number | "unbounded";
export type QueueLimit = number | "unbounded";

export type LimitOptions = {
  /** Cancels the task while it is waiting. Running tasks are not interrupted. */
  signal?: AbortSignal;
};

export class QueueFullError extends Error {
  statusCode = 503;

  constructor(limit: number) {
    super(`render queue is full (${limit} waiting)`);
    this.name = "QueueFullError";
  }
}

export class QueueAbortedError extends Error {
  constructor() {
    super("render request was aborted while waiting for a concurrency slot");
    this.name = "QueueAbortedError";
  }
}

/**
 * Runs a task, waiting for a slot when the limiter is saturated.
 * Resolves/rejects with whatever the task does; the slot is always released.
 */
export type Limiter = <T>(
  task: () => Promise<T>,
  options?: LimitOptions,
) => Promise<T>;

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
export function createLimiter(
  concurrency: Concurrency = 1,
  queueLimit?: QueueLimit,
): Limiter {
  if (
    queueLimit !== undefined &&
    queueLimit !== "unbounded" &&
    (!Number.isInteger(queueLimit) || queueLimit < 0)
  ) {
    throw new Error(
      `queueLimit must be a non-negative integer or "unbounded", got ${String(queueLimit)}`,
    );
  }

  if (concurrency === "unbounded") {
    return (task, options) => {
      if (options?.signal?.aborted) {
        return Promise.reject(new QueueAbortedError());
      }
      return task();
    };
  }

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(
      `concurrency must be a positive integer or "unbounded", got ${String(concurrency)}`,
    );
  }

  const resolvedQueueLimit = queueLimit ?? concurrency * 10;
  let active = 0;
  const waiting: Array<{
    resolve: () => void;
    reject: (error: QueueAbortedError) => void;
    signal?: AbortSignal;
    abort?: () => void;
  }> = [];

  const acquireSlot = (options?: LimitOptions): Promise<void> => {
    const signal = options?.signal;
    if (signal?.aborted) return Promise.reject(new QueueAbortedError());

    if (active < concurrency) {
      active += 1;
      return Promise.resolve();
    }

    if (
      resolvedQueueLimit !== "unbounded" &&
      waiting.length >= resolvedQueueLimit
    ) {
      return Promise.reject(new QueueFullError(resolvedQueueLimit));
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: (typeof waiting)[number] = { resolve, reject, signal };

      if (signal) {
        waiter.abort = () => {
          const index = waiting.indexOf(waiter);
          if (index === -1) return;

          waiting.splice(index, 1);
          reject(new QueueAbortedError());
        };
        signal.addEventListener("abort", waiter.abort, { once: true });
      }

      waiting.push(waiter);
    });
  };

  const release = () => {
    active -= 1;

    const waiter = waiting.shift();
    if (!waiter) return;

    if (waiter.abort) {
      waiter.signal?.removeEventListener("abort", waiter.abort);
    }
    active += 1;
    waiter.resolve();
  };

  return async <T>(
    task: () => Promise<T>,
    options?: LimitOptions,
  ): Promise<T> => {
    await acquireSlot(options);

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
export async function acquire(
  limiter: Limiter,
  options?: LimitOptions,
): Promise<() => void> {
  let release!: () => void;
  let acquired!: () => void;
  let acquisitionFailed!: (error: unknown) => void;

  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve, reject) => {
    acquired = resolve;
    acquisitionFailed = reject;
  });

  // The task keeps the slot until `release` is called; `ready` resolves as soon
  // as the slot is ours. Errors on `held` are impossible — it only ever
  // resolves — so this promise needs no rejection handling.
  void limiter(async () => {
    acquired();
    await held;
  }, options).catch(acquisitionFailed);

  await ready;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
  };
}
