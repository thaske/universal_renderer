import type { Request, Response } from "express";
import type { Limiter } from "../../concurrency";

export const DEFAULT_STALL_AFTER_MS = 30_000;

export type HealthHandlerOptions = {
  /** Limiter to report on. Omitted, the endpoint only reports liveness. */
  limiter?: Limiter;
  /**
   * How long a single render may hold its slot before the process is reported
   * unhealthy, in milliseconds. Defaults to 30s; `false` disables the check.
   *
   * A running task's slot is never revoked, so one render that never settles
   * ends the renderer. Nothing inside the process can recover from that, which
   * is why it has to be visible from outside: the generated `bin/web` polls this
   * endpoint and restarts the renderer.
   */
  stallAfterMs?: number | false;
};

/**
 * Creates a health check handler: 200 with the limiter's state while renders are
 * moving, 503 once one has been stuck past `stallAfterMs`.
 */
export function createHealthHandler(options: HealthHandlerOptions = {}) {
  const { limiter } = options;
  const stallAfterMs = options.stallAfterMs ?? DEFAULT_STALL_AFTER_MS;

  return (_req: Request, res: Response) => {
    const stats = limiter?.stats();
    const stalled =
      stats !== undefined &&
      typeof stallAfterMs === "number" &&
      stallAfterMs > 0 &&
      stats.longestActiveMs > stallAfterMs;

    res.status(stalled ? 503 : 200).json({
      status: stalled ? "STALLED" : "OK",
      timestamp: new Date().toISOString(),
      ...(stats && { renders: stats }),
    });
  };
}
