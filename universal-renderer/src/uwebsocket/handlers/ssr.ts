import type { RenderOutput } from "../../types";
import type { UWSSSRHandlerOptions, UWSHandler } from "../types";

export function createSSRHandler<TContext extends Record<string, any>>(
  options: UWSSSRHandlerOptions<TContext>,
): UWSHandler<TContext> {
  const { setup, render, cleanup } = options;
  if (!setup) throw new Error("setup callback is required");
  if (!render) throw new Error("render callback is required");

  return async (body: any, res: import("uWebSockets.js").HttpResponse) => {
    let context: TContext | undefined;
    try {
      const { url, props = {} } = body ?? {};
      if (!url || typeof url !== "string") {
        res.writeStatus("400");
        res.end(JSON.stringify({ error: "URL string is required" }));
        return;
      }
      context = await setup(url, props);
      const result: RenderOutput = await render(context);
      res.writeHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } catch (err) {
      (options.error || createErrorHandler())(res, err as Error);
    } finally {
      if (context && cleanup) await cleanup(context);
    }
  };
}

import { createErrorHandler } from "./error";
