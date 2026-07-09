import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createLineHandler, createStreamLineHandler } from "./index";

describe("stdio line handler", () => {
  it("throws when setup callback is missing", () => {
    const options = { render: async () => ({ body: "test" }) } as any;
    expect(() => createLineHandler(options)).toThrow(
      "setup callback is required",
    );
  });

  it("throws when render callback is missing", () => {
    const options = { setup: async () => ({}) } as any;
    expect(() => createLineHandler(options)).toThrow(
      "render callback is required",
    );
  });

  it("renders a request line into a single-line JSON response", async () => {
    const handle = createLineHandler({
      setup: (url, props) => ({ url, props }),
      render: (context) => ({
        head: "<title>Test</title>",
        body: `<div>${context.url}</div>`,
        bodyAttrs: { class: "dark" },
      }),
    });

    const response = await handle(
      JSON.stringify({ url: "http://example.com/x", props: {} }),
    );

    expect(response).not.toContain("\n");
    expect(JSON.parse(response!)).toEqual({
      head: "<title>Test</title>",
      body: "<div>http://example.com/x</div>",
      body_attrs: { class: "dark" },
    });
  });

  it("defaults head and body_attrs when render omits them", async () => {
    const handle = createLineHandler({
      setup: () => ({}),
      render: () => ({ body: "minimal" }),
    });

    const response = await handle(JSON.stringify({ url: "/" }));

    expect(JSON.parse(response!)).toEqual({
      head: "",
      body: "minimal",
      body_attrs: {},
    });
  });

  it("passes props to setup and defaults them to an empty object", async () => {
    const setup = vi.fn((url: string, props: any) => ({ url, props }));
    const handle = createLineHandler({
      setup,
      render: () => ({ body: "ok" }),
    });

    await handle(JSON.stringify({ url: "/a", props: { theme: "dark" } }));
    await handle(JSON.stringify({ url: "/b" }));

    expect(setup).toHaveBeenNthCalledWith(1, "/a", { theme: "dark" });
    expect(setup).toHaveBeenNthCalledWith(2, "/b", {});
  });

  it("returns undefined for blank lines", async () => {
    const handle = createLineHandler({
      setup: () => ({}),
      render: () => ({ body: "ok" }),
    });

    expect(await handle("")).toBeUndefined();
    expect(await handle("   ")).toBeUndefined();
  });

  it("responds with an error line for malformed JSON instead of staying silent", async () => {
    const onError = vi.fn();
    const handle = createLineHandler({
      setup: () => ({}),
      render: () => ({ body: "ok" }),
      error: onError,
    });

    const response = await handle("{not json");

    expect(onError).toHaveBeenCalledOnce();
    const parsed = JSON.parse(response!);
    expect(parsed.body).toBe("");
    expect(parsed.error).toMatch(/Invalid JSON payload/);
  });

  it("responds with an error line when render throws", async () => {
    const onError = vi.fn();
    const handle = createLineHandler({
      setup: () => ({}),
      render: () => {
        throw new Error("boom");
      },
      error: onError,
    });

    const parsed = JSON.parse((await handle(JSON.stringify({ url: "/" })))!);

    expect(onError).toHaveBeenCalledOnce();
    expect(parsed).toEqual({
      head: "",
      body: "",
      body_attrs: {},
      error: "boom",
    });
  });

  it("runs cleanup after successful and failed renders", async () => {
    const cleanup = vi.fn();
    let fail = false;
    const handle = createLineHandler({
      setup: () => ({ id: 1 }),
      render: () => {
        if (fail) throw new Error("boom");
        return { body: "ok" };
      },
      cleanup,
    });

    await handle(JSON.stringify({ url: "/" }));
    fail = true;
    await handle(JSON.stringify({ url: "/" }));

    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledWith({ id: 1 });
  });

  it("still responds when cleanup throws", async () => {
    const onError = vi.fn();
    const handle = createLineHandler({
      setup: () => ({}),
      render: () => ({ body: "ok" }),
      cleanup: () => {
        throw new Error("cleanup boom");
      },
      error: onError,
    });

    const parsed = JSON.parse((await handle(JSON.stringify({ url: "/" })))!);

    expect(parsed.body).toBe("ok");
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe("stdio stream handler", () => {
  const TEMPLATE =
    "<html><head><!-- SSR_HEAD --></head><body><!-- SSR_BODY --></body></html>";

  function makeHandler(overrides: Record<string, any> = {}) {
    return createStreamLineHandler({
      setup: (url: string, props: any) => ({ url, props }),
      render: () => ({ body: "unused static path" }),
      streamCallbacks: {
        node: (context: any) => createElement("div", null, context.url),
      },
      ...overrides,
    });
  }

  async function collectFrames(
    handle: ReturnType<typeof makeHandler>,
    payload: Record<string, any>,
  ) {
    const lines: string[] = [];
    await handle(payload as any, (line) => lines.push(line));
    return lines.map((line) => {
      expect(line).not.toContain("\n");
      return JSON.parse(line);
    });
  }

  it("throws when streamCallbacks are missing", () => {
    expect(() =>
      createStreamLineHandler({
        setup: () => ({}),
        render: () => ({ body: "x" }),
      }),
    ).toThrow("streamCallbacks are required");
  });

  it("emits chunk frames terminated by a done frame", async () => {
    const frames = await collectFrames(makeHandler(), {
      url: "/page",
      template: TEMPLATE,
    });

    expect(frames.at(-1)).toEqual({ done: true });
    const html = frames
      .filter((frame) => "chunk" in frame)
      .map((frame) => frame.chunk)
      .join("");
    expect(html.startsWith("<html><head>")).toBe(true);
    expect(html).toContain("<div>/page</div>");
    expect(html.endsWith("</body></html>")).toBe(true);
  });

  it("replaces the head marker with the head callback output", async () => {
    const handle = makeHandler({
      streamCallbacks: {
        node: () => createElement("p", null, "body"),
        head: async () => "<title>streamed</title>",
      },
    });

    const frames = await collectFrames(handle, {
      url: "/",
      template: TEMPLATE,
    });

    expect(frames[0].chunk).toBe(
      "<html><head><title>streamed</title></head><body>",
    );
  });

  it("falls back to context.app when no node callback is given", async () => {
    const handle = makeHandler({
      setup: () => ({ app: createElement("span", null, "from app") }),
      streamCallbacks: {},
    });

    const frames = await collectFrames(handle, {
      url: "/",
      template: TEMPLATE,
    });

    const html = frames.map((frame) => frame.chunk ?? "").join("");
    expect(html).toContain("<span>from app</span>");
  });

  it("emits a single error frame when the template lacks the body marker", async () => {
    const onError = vi.fn();
    const handle = makeHandler({ error: onError });

    const frames = await collectFrames(handle, {
      url: "/",
      template: "<html></html>",
    });

    expect(frames).toHaveLength(1);
    expect(frames[0].error).toMatch(/SSR_BODY/);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("emits a single error frame when the shell throws", async () => {
    const Boom = () => {
      throw new Error("shell boom");
    };
    const handle = makeHandler({
      streamCallbacks: { node: () => createElement(Boom) },
    });

    const frames = await collectFrames(handle, {
      url: "/",
      template: TEMPLATE,
    });

    expect(frames).toHaveLength(1);
    expect(frames[0].error).toBe("shell boom");
  });

  it("emits an error frame when url is missing", async () => {
    const frames = await collectFrames(makeHandler(), {
      template: TEMPLATE,
    });

    expect(frames).toHaveLength(1);
    expect(frames[0].error).toMatch(/URL is required/);
  });

  it("runs cleanup after streaming completes", async () => {
    const cleanup = vi.fn();
    const handle = makeHandler({ cleanup });

    await collectFrames(handle, { url: "/", template: TEMPLATE });

    expect(cleanup).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledWith(expect.objectContaining({ url: "/" }));
  });
});
