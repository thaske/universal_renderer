import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { composeMiddleware } from "./dev";

function fakeResponse(state: Partial<Response> = {}) {
  return { headersSent: false, writableEnded: false, ...state } as Response;
}

const req = {} as Request;

describe("composeMiddleware", () => {
  it("returns the first handler untouched when there is no second", () => {
    const first = vi.fn();

    expect(composeMiddleware(first, undefined)).toBe(first);
  });

  // The app's middleware was previously accepted by the type and then dropped,
  // because it was assigned before the dev server's own.
  it("runs the app's middleware after the dev server's", () => {
    const order: string[] = [];
    const composed = composeMiddleware(
      (_req, _res, next) => {
        order.push("vite");
        (next as NextFunction)();
      },
      (_req, _res, next) => {
        order.push("app");
        (next as NextFunction)();
      },
    );
    const next = vi.fn();

    composed(req, fakeResponse(), next);

    expect(order).toEqual(["vite", "app"]);
    expect(next).toHaveBeenCalledOnce();
  });

  // Vite's stack answers module transforms and HMR itself. Calling the app's
  // middleware afterwards would write to a finished response.
  it("stops when the dev server has already answered", () => {
    const second = vi.fn();
    const composed = composeMiddleware((_req, _res, next) => {
      (next as NextFunction)();
    }, second);

    composed(req, fakeResponse({ headersSent: true }), vi.fn());
    composed(req, fakeResponse({ writableEnded: true }), vi.fn());

    expect(second).not.toHaveBeenCalled();
  });

  it("forwards an error from the dev server without running the app's", () => {
    const error = new Error("transform failed");
    const second = vi.fn();
    const composed = composeMiddleware(
      (_req, _res, next) => (next as NextFunction)(error),
      second,
    );
    const next = vi.fn();

    composed(req, fakeResponse(), next);

    expect(next).toHaveBeenCalledWith(error);
    expect(second).not.toHaveBeenCalled();
  });
});
