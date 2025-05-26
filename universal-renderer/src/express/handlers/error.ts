import type { NextFunction, Request, Response } from "express";

/**
 * Creates an error handler.
 *
 * Returns a JSON response with the error message and stack trace.
 *
 * @returns Error handler function
 */
export function createErrorHandler() {
  return (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const isDev = process.env.NODE_ENV !== "production";

    res.status(500).json({
      error: isDev ? err.message : "Internal Server Error",
      ...(isDev && { stack: err.stack }),
    });
  };
}
