import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSSRHandler } from "./handlers/ssr";
import { createServer, DEFAULT_PORT, resolvePort } from "./server";

let server: Server | undefined;

const listen = async (app: express.Application) => {
  const port = 31000 + Math.floor(Math.random() * 2000);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
  });
  return `http://127.0.0.1:${port}`;
};

const render = (base: string, body: unknown) =>
  fetch(`${base}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

afterEach(async () => {
  if (server) await new Promise((resolve) => server!.close(resolve));
  server = undefined;
});

describe("render lifecycle", () => {
  it("runs setup, prepare, render, cleanup in order", async () => {
    const order: string[] = [];

    const app = await createServer({
      setup: async () => {
        order.push("setup");
        return { id: 1 };
      },
      prepare: () => order.push("prepare"),
      render: () => {
        order.push("render");
        return { body: "<div/>" };
      },
      cleanup: () => void order.push("cleanup"),
    });

    const base = await listen(app);
    const res = await render(base, { url: "http://x/" });

    expect(res.status).toBe(200);
    expect(order).toEqual(["setup", "prepare", "render", "cleanup"]);
  });

  it("returns the payload and body attrs on the wire keys the gem reads", async () => {
    const app = await createServer({
      setup: async () => ({}),
      render: () => ({
        head: "<title>t</title>",
        body: "<div/>",
        bodyAttrs: { class: "dark" },
        payload: { queryCache: [1, 2] },
      }),
    });

    const base = await listen(app);
    const json = (await (
      await render(base, { url: "http://x/" })
    ).json()) as any;

    expect(json).toEqual({
      head: "<title>t</title>",
      body: "<div/>",
      body_attrs: { class: "dark" },
      payload: { queryCache: [1, 2] },
    });
  });

  it("sends payload null rather than omitting the key when the render sent none", async () => {
    const app = await createServer({
      setup: async () => ({}),
      render: () => ({ body: "<div/>" }),
    });

    const base = await listen(app);
    const json = (await (
      await render(base, { url: "http://x/" })
    ).json()) as any;

    expect(json.payload).toBeNull();
    expect(json.body_attrs).toEqual({});
  });

  it("cleans up before the next render begins, so prepare windows cannot overlap", async () => {
    const order: string[] = [];
    let n = 0;

    const app = await createServer({
      setup: async () => {
        const id = ++n;
        order.push(`setup:${id}`);
        // Yield, so an unserialized implementation would interleave here.
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { id };
      },
      prepare: ({ id }) => order.push(`prepare:${id}`),
      render: ({ id }) => {
        order.push(`render:${id}`);
        return { body: `<div>${id}</div>` };
      },
      cleanup: ({ id }) => void order.push(`cleanup:${id}`),
    });

    const base = await listen(app);
    await Promise.all([
      render(base, { url: "http://x/a" }),
      render(base, { url: "http://x/b" }),
    ]);

    expect(order).toEqual([
      "setup:1",
      "prepare:1",
      "render:1",
      "cleanup:1",
      "setup:2",
      "prepare:2",
      "render:2",
      "cleanup:2",
    ]);
  });

  it("interleaves when concurrency is raised", async () => {
    const started: number[] = [];
    let n = 0;

    const app = await createServer({
      concurrency: 2,
      setup: async () => {
        const id = ++n;
        started.push(id);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { id };
      },
      render: ({ id }) => ({ body: `<div>${id}</div>` }),
    });

    const base = await listen(app);
    await Promise.all([
      render(base, { url: "http://x/a" }),
      render(base, { url: "http://x/b" }),
    ]);

    // Both setups begin before either finishes.
    expect(started).toEqual([1, 2]);
  });

  it("cleans up and releases the slot when render throws", async () => {
    const cleanup = vi.fn();

    const app = await createServer({
      setup: async () => ({ id: 1 }),
      render: () => {
        throw new Error("render exploded");
      },
      cleanup,
    });

    const base = await listen(app);

    expect((await render(base, { url: "http://x/" })).status).toBe(500);
    expect(cleanup).toHaveBeenCalledOnce();

    // The slot was returned, so a following request is served rather than hanging.
    expect((await render(base, { url: "http://x/" })).status).toBe(500);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("mounts the endpoints at custom paths", async () => {
    const app = await createServer({
      paths: { render: "/render", health: "/up" },
      setup: async () => ({}),
      render: () => ({ body: "<div/>" }),
    });

    const base = await listen(app);

    expect((await fetch(`${base}/up`)).status).toBe(200);
    expect((await render(base, { url: "http://x/" })).status).toBe(404);
    expect(
      (
        await fetch(`${base}/render`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "http://x/" }),
        })
      ).status,
    ).toBe(200);
  });

  it("rejects malformed requests without consuming a render slot", async () => {
    const setup = vi.fn(async () => ({}));

    const app = await createServer({
      setup,
      render: () => ({ body: "<div/>" }),
    });

    const base = await listen(app);

    expect((await render(base, {})).status).toBe(400);
    expect((await render(base, { url: 5 })).status).toBe(400);
    expect((await render(base, { url: "http://x/", props: [] })).status).toBe(
      400,
    );
    expect(setup).not.toHaveBeenCalled();

    expect((await render(base, { url: "http://x/" })).status).toBe(200);
  });
});

describe("createSSRHandler", () => {
  it("requires setup and render", () => {
    expect(() =>
      createSSRHandler({
        setup: undefined as any,
        render: () => ({ body: "" }),
      }),
    ).toThrow("setup callback is required");
    expect(() =>
      createSSRHandler({ setup: async () => ({}), render: undefined as any }),
    ).toThrow("render callback is required");
  });
});

describe("render timeout", () => {
  it("answers 504 rather than holding the caller open forever", async () => {
    const app = await createServer({
      setup: async () => ({}),
      render: () => new Promise<never>(() => {}),
      renderTimeout: 30,
    });
    const base = await listen(app);

    const res = await render(base, { url: "http://x/", props: {} });

    expect(res.status).toBe(504);
  });

  // The stuck render still owns its slot on purpose: it is still touching
  // module state. Nothing inside the process can clear that, so the only honest
  // thing to do is say so from outside.
  it("reports the process as stalled on /health while a render is stuck", async () => {
    const app = await createServer({
      setup: async () => ({}),
      render: () => new Promise<never>(() => {}),
      renderTimeout: 30,
    });
    const base = await listen(app);

    expect((await fetch(`${base}/health`)).status).toBe(200);

    await render(base, { url: "http://x/", props: {} });

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(503);

    const body = (await health.json()) as {
      status: string;
      renders: { active: number };
    };
    expect(body.status).toBe("STALLED");
    expect(body.renders.active).toBe(1);
  });

  it("leaves renders alone when the timeout is disabled", async () => {
    const app = await createServer({
      setup: async () => ({}),
      render: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return { body: "<div>slow</div>" };
      },
      renderTimeout: false,
    });
    const base = await listen(app);

    const res = await render(base, { url: "http://x/", props: {} });

    expect(res.status).toBe(200);
    expect((await res.json()).body).toBe("<div>slow</div>");
  });
});

describe("resolvePort", () => {
  const original = process.env.SSR_PORT;
  afterEach(() => {
    if (original === undefined) delete process.env.SSR_PORT;
    else process.env.SSR_PORT = original;
  });

  it("prefers the explicit port, then SSR_PORT, then the default", () => {
    delete process.env.SSR_PORT;
    expect(resolvePort()).toBe(DEFAULT_PORT);
    expect(resolvePort(4000)).toBe(4000);

    process.env.SSR_PORT = "4100";
    expect(resolvePort()).toBe(4100);
    expect(resolvePort(4000)).toBe(4000);
  });

  // `listen` would otherwise fail with an opaque error at boot, long after the
  // typo that caused it.
  it("rejects ports that cannot be bound", () => {
    expect(() => resolvePort(3001.5)).toThrow(/integer/);
    expect(() => resolvePort(70000)).toThrow(/integer/);

    process.env.SSR_PORT = "not-a-port";
    expect(() => resolvePort()).toThrow(/SSR_PORT/);

    process.env.SSR_PORT = "";
    expect(resolvePort()).toBe(DEFAULT_PORT);
  });
});
