import type { RequestInfo, ResponseUtils } from "../../types";

/**
 * Creates a health check handler.
 *
 * Returns a simple JSON response indicating the server is running.
 * Useful for load balancers, monitoring systems, and deployment health checks.
 *
 * @returns Health check handler
 */
export function createHealthHandler() {
  return (req: RequestInfo, res: ResponseUtils) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
    });
  };
}
