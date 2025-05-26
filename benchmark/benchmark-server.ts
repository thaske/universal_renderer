#!/usr/bin/env bun
import type { ExpressServerOptions } from "universal-renderer/express";
import { createServer as createExpressServer } from "universal-renderer/express";
import type { HonoServerOptions } from "universal-renderer/hono";
import { createServer as createHonoServer } from "universal-renderer/hono";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// Define the expected arguments
const argv = yargs(hideBin(process.argv))
  .option("ssr", {
    type: "boolean",
    default: true,
    description: "Enable Server-Side Rendering",
  })
  .option("stream", {
    type: "boolean",
    default: false,
    description: "Enable Streaming",
  })
  .option("server", {
    choices: ["express", "hono"],
    default: "express",
    description: "Server implementation to use",
  })
  .option("port", {
    type: "number",
    default: 3001,
    description: "Port to run the server on",
  })
  .help().argv;

async function main() {
  const { ssr, stream, server: serverImpl, port } = await argv;

  console.log(
    `Starting server with: SSR=${ssr}, Stream=${stream}, Implementation=${serverImpl}, Port=${port}`,
  );

  const commonOptions = {
    setup: async (url: string, props: any) => {
      // Minimal setup for benchmarking
      return { url, props, timestamp: new Date().toISOString() };
    },
    render: async (context: any) => {
      // Minimal render for benchmarking
      if (!ssr) {
        // If SSR is off, return an empty body. Client-side rendering would take over.
        return { head: "<title>Benchmark</title>", body: "" };
      }
      return {
        head: `<title>Benchmark: ${context.url}</title>`,
        body: `<h1>Hello from ${context.url}</h1><p>Rendered at: ${context.timestamp}</p>`,
      };
    },
    cleanup: async (context: any) => {
      // No-op cleanup for benchmark
    },
  };

  let streamCallbacks;
  if (stream) {
    streamCallbacks = {
      // Using a simple string for Node stream for now, actual React component streaming would be more complex
      node: (context: any) =>
        `<div>Streaming content for ${context.url}</div>` as any,
      head: async (context: any) =>
        `<meta name="stream-test" content="true" data-url="${context.url}">`,
    };
  }

  if (serverImpl === "express") {
    const options: ExpressServerOptions<any> = {
      ...commonOptions,
      ...(stream && { streamCallbacks }),
    };
    const app = await createExpressServer(options);
    app.listen(port, () => {
      console.log(`Express server running on http://localhost:${port}`);
    });
  } else if (serverImpl === "hono") {
    const options: HonoServerOptions<any> = {
      ...commonOptions,
      ...(stream && { streamCallbacks }),
    };
    const app = await createHonoServer(options);
    console.log(`Hono server running on http://localhost:${port}`);
    // @ts-ignore Bun types might not be fully recognized here but this is standard Hono w/ Bun
    Bun.serve({ fetch: app.fetch, port });
  }
}

main().catch((err) => {
  console.error("Failed to start benchmark server:", err);
  process.exit(1);
});
