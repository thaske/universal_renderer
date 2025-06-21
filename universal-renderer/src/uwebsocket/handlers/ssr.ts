import type { RenderOutput } from "../../types";
import type { UWSHandler, UWSSSRHandlerOptions } from "../types";

export function createSSRHandler<TContext extends Record<string, any>>(
  options: UWSSSRHandlerOptions<TContext>,
): UWSHandler<TContext> {
  const { setup, render, cleanup } = options;
  if (!setup) throw new Error("setup callback is required");
  if (!render) throw new Error("render callback is required");

  return async (body: any, res: import("uWebSockets.js").HttpResponse) => {
    /* Can't return or yield from here without responding or attaching an abort handler */
    res.onAborted(() => {
      res.aborted = true;
    });

    const { url, props = {} } = body ?? {};

    const context = await setup(url, props);
    const result: RenderOutput = await render(context);

    if (!res.aborted) {
      res.cork(() => {
        res.writeHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      });
    }
  };
}
