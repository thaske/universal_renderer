import { describe, expect, it } from "vitest";
import { acquire, createLimiter } from "./concurrency";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("createLimiter", () => {
  it("serializes by default", async () => {
    const limiter = createLimiter();
    const order: string[] = [];
    const first = deferred();

    const a = limiter(async () => {
      order.push("a:start");
      await first.promise;
      order.push("a:end");
    });
    const b = limiter(async () => {
      order.push("b:start");
    });

    // b must not have started while a holds the only slot.
    await Promise.resolve();
    expect(order).toEqual(["a:start"]);

    first.resolve();
    await Promise.all([a, b]);

    expect(order).toEqual(["a:start", "a:end", "b:start"]);
  });

  it("releases the slot when a task throws", async () => {
    const limiter = createLimiter(1);

    await expect(
      limiter(async () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");

    await expect(limiter(async () => "next")).resolves.toBe("next");
  });

  it("allows the configured number of concurrent tasks", async () => {
    const limiter = createLimiter(2);
    let active = 0;
    let peak = 0;
    const gate = deferred();

    const tasks = Array.from({ length: 5 }, () =>
      limiter(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
      }),
    );

    await Promise.resolve();
    gate.resolve();
    await Promise.all(tasks);

    expect(peak).toBe(2);
  });

  it("does not limit when unbounded", async () => {
    const limiter = createLimiter("unbounded");
    let active = 0;
    let peak = 0;
    const gate = deferred();

    const tasks = Array.from({ length: 4 }, () =>
      limiter(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
      }),
    );

    await Promise.resolve();
    gate.resolve();
    await Promise.all(tasks);

    expect(peak).toBe(4);
  });

  it("rejects a nonsensical limit rather than silently serializing", () => {
    expect(() => createLimiter(0)).toThrow(/positive integer/);
    expect(() => createLimiter(-1)).toThrow(/positive integer/);
    expect(() => createLimiter(1.5)).toThrow(/positive integer/);
  });
});

describe("acquire", () => {
  it("holds the slot until released", async () => {
    const limiter = createLimiter(1);
    const release = await acquire(limiter);

    let ran = false;
    const queued = limiter(async () => {
      ran = true;
    });

    await Promise.resolve();
    expect(ran).toBe(false);

    release();
    await queued;
    expect(ran).toBe(true);
  });

  it("is idempotent, so a double release cannot over-admit", async () => {
    const limiter = createLimiter(1);
    const release = await acquire(limiter);
    release();
    release();

    let active = 0;
    let peak = 0;
    const gate = deferred();
    const tasks = Array.from({ length: 2 }, () =>
      limiter(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
      }),
    );

    await Promise.resolve();
    gate.resolve();
    await Promise.all(tasks);

    expect(peak).toBe(1);
  });
});
