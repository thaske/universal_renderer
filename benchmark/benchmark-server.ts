#!/usr/bin/env bun
import React from "react";
import type { BunServerOptions } from "universal-renderer/bun";
import { createServer as createBunServer } from "universal-renderer/bun";
import type { ExpressServerOptions } from "universal-renderer/express";
import { createServer as createExpressServer } from "universal-renderer/express";
import type { UWSServerOptions } from "universal-renderer/uwebsocket";

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
    choices: ["express", "bun", "uwebsocket"],
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
      node: (context: any) =>
        React.createElement(
          "div",
          null,
          `Streaming content for ${context.url}`,
        ),
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
  } else if (serverImpl === "bun") {
    const options: BunServerOptions<any> = {
      ...commonOptions,
      ...(stream && { streamCallbacks }),
      port,
    };
    const server = await createBunServer(options);
    Bun.serve(server);
    console.log(`Bun server running on http://localhost:${port}`);
  } else if (serverImpl === "uwebsocket") {
    const { createServer: createUWebSocketServer } = await import(
      "universal-renderer/uwebsocket"
    );
    const options: UWSServerOptions<any> = {
      ...commonOptions,
    };
    const app = await createUWebSocketServer(options);
  }
}

main().catch((err) => {
  console.error("Failed to start benchmark server:", err);
  process.exit(1);
});
