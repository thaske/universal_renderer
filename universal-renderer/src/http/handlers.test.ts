import { createElement } from "react";
import type { AddressInfo } from "node:net";
import { request, type Server } from "node:http";
import { Transform } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "./server";

async function listen(app: Awaited<ReturnType<typeof createServer>>) {
  const server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () => {
      resolve(listeningServer);
    });
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function basicOptions() {
  return {
    setup: async (url: string, props: Record<string, any>) => ({ url, props }),
    render: async () => ({ body: "<div>Rendered</div>" }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HTTP handler hardening", () => {
  it("applies custom middleware to built-in routes", async () => {
    const app = await createServer({
      ...basicOptions(),
      middleware: (_req, res, next) => {
        res.setHeader("x-custom", "present");
        next();
      },
    });
    const server = await listen(app);

    try {
      const health = await fetch(`${server.baseUrl}/health`);
      const render = await fetch(`${server.baseUrl}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "/test" }),
      });

      expect(health.headers.get("x-custom")).toBe("present");
      expect(render.headers.get("x-custom")).toBe("present");
    } finally {
      await server.close();
    }
  });

  it("returns 400 for a streaming request without a usable JSON body", async () => {
    const app = await createServer({
      ...basicOptions(),
      streamCallbacks: {
        node: () => createElement("div", null, "streamed"),
      },
    });
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/stream`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not json",
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "URL string is required",
      });
    } finally {
      await server.close();
    }
  });

  it("handles asynchronous streaming head failures and cleans up", async () => {
    const cleanup = vi.fn(async () => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = await createServer({
      ...basicOptions(),
      cleanup,
      streamCallbacks: {
        node: () => createElement("div", null, "streamed"),
        head: async () => {
          throw new Error("head failed");
        },
      },
    });
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "/test",
          template:
            "<html><!-- SSR_HEAD --><body><!-- SSR_BODY --></body></html>",
        }),
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: "head failed" });
      await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
    } finally {
      await server.close();
    }
  });

  it("contains cleanup failures after a blocking response", async () => {
    const cleanupError = new Error("cleanup failed");
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const app = await createServer({
      ...basicOptions(),
      cleanup: async () => {
        throw cleanupError;
      },
    });
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "/test" }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        body: "<div>Rendered</div>",
      });
      await vi.waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(
          "[SSR] Cleanup error:",
          cleanupError,
        ),
      );
    } finally {
      await server.close();
    }
  });

  it("aborts rendering and cleans up when the client disconnects", async () => {
    const cleanup = vi.fn(async () => {});
    const app = await createServer({
      ...basicOptions(),
      cleanup,
      streamCallbacks: {
        node: () => createElement("div", null, "streamed"),
        transform: () =>
          new Transform({
            transform(chunk, _encoding, callback) {
              setTimeout(() => callback(null, chunk), 100);
            },
          }),
      },
    });
    const server = await listen(app);

    try {
      await new Promise<void>((resolve, reject) => {
        const clientRequest = request(
          `${server.baseUrl}/stream`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
          },
          (response) => {
            response.once("data", () => {
              response.destroy();
              resolve();
            });
          },
        );
        clientRequest.once("error", reject);
        clientRequest.end(
          JSON.stringify({
            url: "/test",
            template: "<html><body><!-- SSR_BODY --></body></html>",
          }),
        );
      });

      await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
    } finally {
      await server.close();
    }
  });

  it("cleans up when React cannot produce a shell", async () => {
    const cleanup = vi.fn(async () => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Broken = () => {
      throw new Error("shell failed");
    };
    const app = await createServer({
      ...basicOptions(),
      cleanup,
      streamCallbacks: { node: () => createElement(Broken) },
    });
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: "/test",
          template: "<html><body><!-- SSR_BODY --></body></html>",
        }),
      });

      expect(response.status).toBe(500);
      await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
    } finally {
      await server.close();
    }
  });
});
