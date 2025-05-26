import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";

/**
 * Creates an error handler for the server.
 *
 * Returns a JSON response with the error message and stack trace.
 *
 * @returns Express error handler for errors
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createErrorHandler } from 'universal-renderer';
 *
 * const app = express();
 * app.use(createErrorHandler());
 * ```
 */
export function createErrorHandler(): ErrorRequestHandler {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("[SSR] Unhandled error:", err);
    const isDev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      error: isDev ? err.message : "Internal Server Error",
      ...(isDev && { stack: err.stack }),
    });
  };
}
