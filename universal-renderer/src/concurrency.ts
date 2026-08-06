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

export class RenderTimeoutError extends Error {
  statusCode = 504;

  constructor(timeoutMs: number) {
    super(`render did not finish within ${timeoutMs}ms`);
    this.name = "RenderTimeoutError";
  }
}

/** A snapshot of what the limiter is doing, for the health endpoint. */
export type LimiterStats = {
  /** Tasks holding a slot. */
  active: number;
  /** Tasks waiting for one. */
  waiting: number;
  /**
   * How long the longest-running task has held its slot, in milliseconds; 0
   * when idle. A value past the render timeout means a render is stuck and,
   * because slots are not revoked from running tasks, is never coming back.
   */
  longestActiveMs: number;
};

/**
 * Runs a task, waiting for a slot when the limiter is saturated.
 * Resolves/rejects with whatever the task does; the slot is always released.
 */
export type Limiter = {
  <T>(task: () => Promise<T>, options?: LimitOptions): Promise<T>;
  stats(): LimiterStats;
};

/**
 * Rejects with {@link RenderTimeoutError} if `promise` has not settled in time,
 * without disturbing `promise` itself — a render that is still running is still
 * touching module state, so its slot must stay held until it finishes.
 *
 * `onTimeout` is where the caller cancels whatever it can (dropping a queued
 * task, aborting a React render).
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | false | undefined,
  onTimeout?: () => void,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new RenderTimeoutError(timeoutMs));
    }, timeoutMs);
    // Never hold the process open for a timer whose only job is to fire late.
    timer.unref?.();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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

  // Start times of in-flight tasks, so `stats()` can report a stuck render.
  // Keyed by a counter rather than by the timestamp: two tasks can start in the
  // same millisecond, and deleting by timestamp would drop both.
  const startedAt = new Map<number, number>();
  let nextTaskId = 0;

  const longestActiveMs = () => {
    let oldest = 0;
    const now = Date.now();
    for (const start of startedAt.values()) {
      const held = now - start;
      if (held > oldest) oldest = held;
    }
    return oldest;
  };

  const track = async <T>(task: () => Promise<T>): Promise<T> => {
    const id = nextTaskId++;
    startedAt.set(id, Date.now());
    try {
      return await task();
    } finally {
      startedAt.delete(id);
    }
  };

  if (concurrency === "unbounded") {
    const unbounded = (<T>(
      task: () => Promise<T>,
      options?: LimitOptions,
    ): Promise<T> => {
      if (options?.signal?.aborted) {
        return Promise.reject(new QueueAbortedError());
      }
      return track(task);
    }) as Limiter;

    unbounded.stats = () => ({
      active: startedAt.size,
      waiting: 0,
      longestActiveMs: longestActiveMs(),
    });

    return unbounded;
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

  const limiter = (async <T>(
    task: () => Promise<T>,
    options?: LimitOptions,
  ): Promise<T> => {
    await acquireSlot(options);

    try {
      return await track(task);
    } finally {
      release();
    }
  }) as Limiter;

  limiter.stats = () => ({
    active,
    waiting: waiting.length,
    longestActiveMs: longestActiveMs(),
  });

  return limiter;
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
