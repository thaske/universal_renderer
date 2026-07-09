import { describe, expect, it, vi } from "vitest";
import { createLineHandler } from "./index";

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

    const parsed = JSON.parse(
      (await handle(JSON.stringify({ url: "/" })))!,
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(parsed).toEqual({ head: "", body: "", body_attrs: {}, error: "boom" });
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

    const parsed = JSON.parse(
      (await handle(JSON.stringify({ url: "/" })))!,
    );

    expect(parsed.body).toBe("ok");
    expect(onError).toHaveBeenCalledOnce();
  });
});
