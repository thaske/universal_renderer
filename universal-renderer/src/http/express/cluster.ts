import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import type express from "express";

export type ClusterOptions = {
  port?: number;
  host?: string;
  workers?: number;
};

export function startCluster(
  app: express.Application,
  options?: ClusterOptions,
): void {
  const workers = options?.workers ?? availableParallelism();
  const port = options?.port ?? Number(process.env.PORT ?? 3000);
  const host = options?.host ?? "0.0.0.0";

  if (cluster.isPrimary) {
    for (let i = 0; i < workers; i++) cluster.fork();
    cluster.on("exit", () => cluster.fork());
    return;
  }

  app.listen(port, host, () => {
    const id = cluster.worker?.id ?? process.pid;
    console.log(`[${id}] listening on ${host}:${port}`);
  });
}
