import { createServer } from "./http";
import { createRenderer } from "./stdio";
import type { SSRHandlerOptions } from "./types";

export type SSRTransport = "stdio" | "http";

export type SsrOptions<
  TContext extends Record<string, any> = Record<string, any>,
> = SSRHandlerOptions<TContext> & {
  transport?: SSRTransport;
  port?: number;
};

type RuntimeWithProcess = typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

export async function ssr<
  TContext extends Record<string, any> = Record<string, any>,
>(options: SsrOptions<TContext>): Promise<void> {
  const runtime = globalThis as RuntimeWithProcess;
  const envTransport = runtime.process?.env?.SSR_TRANSPORT;
  const transport = options.transport ?? (envTransport === "http" ? "http" : "stdio");

  if (transport === "stdio") {
    await createRenderer(options);
    return;
  }

  const port = options.port ?? Number(runtime.process?.env?.SSR_PORT || 3001);
  const server = await createServer({ ...options, port } as any);

  // HTTP transport resolves to an Express app.
  await new Promise<void>((resolve, reject) => {
    const app = server as any;
    if (typeof app?.listen !== "function") {
      reject(new Error("HTTP SSR server does not expose a listen method in this runtime."));
      return;
    }
    app.listen(port, (err?: Error) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
