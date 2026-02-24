import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Creates an error handler that supports different HTTP status codes.
 *
 * Returns a JSON response with the appropriate status code, error message and stack trace.
 * Supports errors with statusCode or status properties for proper HTTP status handling.
 *
 * @returns Error handler function
 */
export function createErrorHandler() {
  return (
    err: HttpError,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    const isDev = process.env.NODE_ENV !== "production";

    const statusCode = err.statusCode || 500;

    if (statusCode >= 500) {
      console.error("[SSR] Express Server Error:", err);
    }

    res.status(statusCode).json({
      error: isDev
        ? err.message
        : statusCode >= 500
          ? "Internal Server Error"
          : err.message,
      ...(isDev && { stack: err.stack }),
    });
  };
}
