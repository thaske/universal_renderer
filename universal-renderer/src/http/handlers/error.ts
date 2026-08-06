import type { NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  statusCode?: number;
  status?: number;

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
  return (err: HttpError, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);

    // Opt in rather than opt out. `NODE_ENV !== "production"` reads like a
    // production guard but is not one: nothing in a Rails deploy sets NODE_ENV
    // for the renderer process, so the previous default returned messages and
    // stack traces from every production render. Set SSR_VERBOSE_ERRORS=1, or
    // NODE_ENV=development, to get them back.
    const isDev =
      process.env.SSR_VERBOSE_ERRORS === "1" ||
      process.env.NODE_ENV === "development" ||
      process.env.NODE_ENV === "test";

    const statusCode = err.statusCode || err.status || 500;

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
