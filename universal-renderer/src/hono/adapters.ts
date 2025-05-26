import type { Context } from "hono";
import type {
  RequestInfo,
  ResponseUtils,
  UniversalHandler,
} from "../core/types";

/**
 * Converts Hono context to framework-agnostic RequestInfo
 */
export function adaptRequest(c: Context): RequestInfo {
  return {
    body: c.req.json ? c.req.json() : {},
    method: c.req.method,
    url: c.req.url,
  };
}

/**
 * Converts Hono context to framework-agnostic ResponseUtils
 */
export function adaptResponse(c: Context): ResponseUtils {
  return {
    json: (data: any, status?: number) => {
      if (status) c.status(status);
      return c.json(data);
    },
    text: (data: string, status?: number) => {
      if (status) c.status(status);
      return c.text(data);
    },
    status: (code: number) => {
      c.status(code);
    },
    setHeader: (name: string, value: string) => {
      c.header(name, value);
    },
  };
}

/**
 * Adapts a universal handler to work with Hono
 */
export function adaptHandler(handler: UniversalHandler) {
  return async (c: Context) => {
    const requestInfo = adaptRequest(c);
    const responseUtils = adaptResponse(c);
    await handler(requestInfo, responseUtils);
  };
}
