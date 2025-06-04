import { PassThrough, Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server.node";
import { SSR_MARKERS } from "@/constants";
import type { ReactNode } from "react";
import type { UWSStreamHandlerOptions, UWSHandler } from "../types";
import { createErrorHandler } from "./error";

export function createStreamHandler<TContext extends Record<string, any>>(
  options: UWSStreamHandlerOptions<TContext>,
): UWSHandler<TContext> {
  const { setup, streamCallbacks, cleanup } = options;
  if (!streamCallbacks) throw new Error("streamCallbacks are required");
  if (!setup) throw new Error("setup callback is required");

  return async (body: any, res: import("uWebSockets.js").HttpResponse) => {
    let context: TContext | undefined;
    try {
      const { url = "", props = {}, template = "" } = body ?? {};
      if (!url) throw new Error("URL is required");
      if (!template.includes(SSR_MARKERS.BODY))
        throw new Error(`Template missing ${SSR_MARKERS.BODY} marker`);

      context = await setup(url, props);
      let reactNode: ReactNode;
      if (streamCallbacks.node) reactNode = streamCallbacks.node(context);
      else if (context && (context as any).app) reactNode = (context as any).app;
      else if (context && (context as any).jsx) reactNode = (context as any).jsx;
      else throw new Error("No app callback provided");

      const [headPart, tailPart] = template.split(SSR_MARKERS.BODY);
      const headContent = streamCallbacks.head
        ? await streamCallbacks.head(context)
        : "";

      res.cork(() => {
        res.writeHeader("Content-Type", "text/html");
        res.write(headPart.replace(SSR_MARKERS.HEAD, headContent));
      });

      const nodeStream = new PassThrough();
      const transform = streamCallbacks.transform?.(context);
      if (transform) nodeStream.pipe(transform).on("data", (c) => res.write(c));
      else nodeStream.on("data", (c) => res.write(c));

      nodeStream.on("end", () => {
        res.end(tailPart);
        cleanup?.(context!);
      });

      const { pipe } = renderToPipeableStream(reactNode, {
        onShellReady() {
          pipe(nodeStream);
        },
        onShellError(err) {
          createErrorHandler()(res, err as Error);
        },
        onError(err) {
          console.error("[SSR] Stream error", err);
        },
      });
    } catch (err) {
      createErrorHandler()(res, err as Error);
      if (context) cleanup?.(context);
    }
  };
}
