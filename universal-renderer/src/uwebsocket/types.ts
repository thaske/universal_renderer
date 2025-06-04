import type {
  BaseHandlerOptions,
  SSRHandlerOptions as CoreSSRHandlerOptions,
  StreamHandlerOptions as CoreStreamHandlerOptions,
} from "../types";

export type UWSBaseHandlerOptions<TContext extends Record<string, any>> =
  BaseHandlerOptions<TContext> & {
    error?: (res: import("uWebSockets.js").HttpResponse, error: Error) => void;
  };

export type UWSHandler<TContext extends Record<string, any>> = (
  body: any,
  res: import("uWebSockets.js").HttpResponse,
) => void | Promise<void>;

export type UWSSSRHandlerOptions<TContext extends Record<string, any>> =
  CoreSSRHandlerOptions<TContext> & {
    error?: (res: import("uWebSockets.js").HttpResponse, error: Error) => void;
  };

export type UWSStreamHandlerOptions<TContext extends Record<string, any>> =
  CoreStreamHandlerOptions<TContext> & {
    error?: (res: import("uWebSockets.js").HttpResponse, error: Error) => void;
  };

export type UWSServerOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = UWSSSRHandlerOptions<TContext> & {
  streamCallbacks?: UWSStreamHandlerOptions<TContext>["streamCallbacks"];
};
