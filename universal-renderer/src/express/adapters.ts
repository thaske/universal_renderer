import type { Request, Response } from "express";
import type {
  RequestInfo,
  ResponseUtils,
  UniversalHandler,
} from "../core/types";

/**
 * Converts Express request to framework-agnostic RequestInfo
 */
export function adaptRequest(req: Request): RequestInfo {
  return {
    body: req.body || {},
    method: req.method,
    url: req.url,
  };
}

/**
 * Converts Express response to framework-agnostic ResponseUtils
 */
export function adaptResponse(res: Response): ResponseUtils {
  return {
    json: (data: any, status?: number) => {
      if (status) res.status(status);
      res.json(data);
    },
    text: (data: string, status?: number) => {
      if (status) res.status(status);
      res.send(data);
    },
    status: (code: number) => {
      res.status(code);
    },
    setHeader: (name: string, value: string) => {
      res.setHeader(name, value);
    },
  };
}

/**
 * Adapts a universal handler to work with Express
 */
export function adaptHandler(handler: UniversalHandler) {
  return async (req: Request, res: Response) => {
    const requestInfo = adaptRequest(req);
    const responseUtils = adaptResponse(res);
    await handler(requestInfo, responseUtils);
  };
}
