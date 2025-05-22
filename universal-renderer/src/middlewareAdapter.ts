import { PassThrough, Writable } from "node:stream";

/**
 * Minimal IncomingMessage shim – enough for Connect-compatible middleware.
 */
class NodeRequestShim extends PassThrough {
  method: string;
  url: string;
  headers: Record<string, string>;
  httpVersion = "1.1";
  httpVersionMajor = 1;
  httpVersionMinor = 1;

  constructor(original: Request) {
    super();

    const parsed = new URL(original.url);

    this.method = original.method;
    this.url = parsed.pathname + parsed.search;
    this.headers = Object.fromEntries(original.headers.entries());

    // Pipe body (if any) into the Node-style readable stream.
    queueMicrotask(async () => {
      if (original.body) {
        const reader = (
          original.body as ReadableStream<Uint8Array>
        ).getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          this.write(Buffer.from(value));
        }
      }
      this.end();
    });
  }
}

/**
 * Writable that captures what Connect writes and turns it into a Bun `Response`.
 */
class NodeResponseShim extends Writable {
  private statusCodeInternal = 200;
  private headersInternal: Record<string, string | string[]> = {};
  private readonly stream = new PassThrough();
  private sent = false;
  private readonly resolveResponse: (res: Response) => void;

  constructor(resolve: (res: Response) => void) {
    super();
    this.resolveResponse = resolve;
  }

  /* Node `ServerResponse` compatibility – BEGIN */
  get statusCode() {
    return this.statusCodeInternal;
  }
  set statusCode(code: number) {
    this.statusCodeInternal = code;
  }

  writeHead(status: number, headers?: Record<string, any>) {
    this.statusCodeInternal = status;
    if (headers) {
      Object.assign(this.headersInternal, headers);
    }
  }

  setHeader(name: string, value: string | string[]) {
    this.headersInternal[name] = value;
  }
  getHeader(name: string) {
    return this.headersInternal[name];
  }
  removeHeader(name: string) {
    delete this.headersInternal[name];
  }

  flushHeaders() {
    // For the purpose of Bun `Response`, flushing headers just guarantees the
    // response is created. Streaming continues transparently.
    this.sendResponseIfNeeded();
  }
  /* Node `ServerResponse` compatibility – END */

  // Internal: transform chunks written by Connect into Bun-readable stream.
  _write(chunk: any, _enc: string, cb: (error?: Error | null) => void) {
    this.sendResponseIfNeeded();
    this.stream.write(chunk, _enc as any, cb);
  }

  end(chunk?: any, enc?: any, cb?: any): this {
    if (chunk) this.write(chunk, enc, () => {});
    this.stream.end();
    this.sendResponseIfNeeded();
    if (typeof cb === "function") cb();
    return this;
  }

  private sendResponseIfNeeded() {
    if (this.sent) return;
    this.sent = true;
    const res = new Response(this.stream as any, {
      status: this.statusCodeInternal,
      headers: this.headersInternal as Record<string, string>,
    });
    this.resolveResponse(res);
  }
}

/**
 * Type representing a Connect/Express-style middleware function.
 */
export type ConnectMiddleware = (
  req: any,
  res: any,
  next: (err?: any) => void,
) => void;

/**
 * Adapts any Connect-compatible middleware to a handler signature understood by Bun's router.
 * Useful when spinning up an SSR server with `Bun.serve` while still leveraging Vite's dev middleware
 * stack for HMR & static asset serving.
 *
 * Example usage:
 *
 * ```ts
 * import { adaptMiddleware } from "universal-renderer/middlewareAdapter";
 *
 * const vite = await createViteServer({ ... });
 * const middlewareHandler = adaptMiddleware(vite.middlewares);
 *
 * Bun.serve({ routes: { "/*": middlewareHandler } });
 * ```
 */
export function adaptMiddleware(middleware: ConnectMiddleware) {
  return function bunHandler(req: Request): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const nodeReq = new NodeRequestShim(req);
      const nodeRes = new NodeResponseShim(resolve);

      // Connect-style `next` – if nobody handles the request we fall back to 404.
      const next = (err?: any) => {
        if (err) {
          console.error("[Middleware] error", err);
          resolve(new Response("Internal Server Error", { status: 500 }));
          return;
        }
        resolve(new Response("Not Found", { status: 404 }));
      };

      try {
        middleware(nodeReq as any, nodeRes as any, next);
      } catch (error) {
        console.error("[Middleware] threw synchronously", error);
        reject(error);
      }
    });
  };
}
