import type { FastifyReply, FastifyRequest } from "fastify";
import type { StreamHandlerOptions as BaseStreamHandlerOptions } from "../types";

export interface FastifyStreamHandlerOptions<
  TContext extends Record<string, any>,
> extends BaseStreamHandlerOptions<TContext> {
  error?: (
    error: Error,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => void | Promise<void>;
}
