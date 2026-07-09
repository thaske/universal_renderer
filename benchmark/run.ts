import { spawn, type ChildProcess } from "child_process";
import fs from "fs/promises";
import getPort from "get-port";
import http from "http";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const LOG_FILE = path.join(ROOT, "tmp", "benchmark-http-server.log");

async function waitForHealth(port: number, process: ChildProcess) {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (process.exitCode !== null || process.signalCode !== null) {
      throw new Error(
        `HTTP benchmark server exited early with code=${process.exitCode} signal=${process.signalCode}`,
      );
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const request = http.get(
          `http://127.0.0.1:${port}/health`,
          (response) => {
            response.resume();
            if (
              response.statusCode &&
              response.statusCode >= 200 &&
              response.statusCode < 300
            ) {
              resolve();
            } else {
              reject(new Error(`health returned ${response.statusCode}`));
            }
          },
        );
        request.setTimeout(500, () => {
          request.destroy(new Error("health timed out"));
        });
        request.on("error", reject);
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(
    `Timed out waiting for HTTP benchmark server: ${String(lastError)}`,
  );
}

async function shutdown(process: ChildProcess | null) {
  if (!process?.pid || process.exitCode !== null || process.signalCode !== null)
    return;

  try {
    globalThis.process.kill(-process.pid, "SIGTERM");
  } catch (error: any) {
    if (error?.code !== "ESRCH") throw error;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (
        process.exitCode === null &&
        process.signalCode === null &&
        process.pid
      ) {
        try {
          globalThis.process.kill(-process.pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
      resolve();
    }, 2_000);

    process.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  const log = await fs.open(LOG_FILE, "w");
  const port = await getPort();

  const server = spawn(
    globalThis.process.execPath,
    [
      "--import",
      "tsx",
      "benchmark/benchmark-server.ts",
      "--port",
      String(port),
    ],
    {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", log.fd, log.fd],
    },
  );

  try {
    await waitForHealth(port, server);

    const ruby = spawn(
      "bundle",
      ["exec", "ruby", "benchmark/http-vs-stdio.rb"],
      {
        cwd: ROOT,
        stdio: "inherit",
        env: {
          ...globalThis.process.env,
          UNIVERSAL_RENDERER_URL: `http://127.0.0.1:${port}/`,
          UNIVERSAL_RENDERER_STDIO_CLI_SCRIPT:
            globalThis.process.env.UNIVERSAL_RENDERER_STDIO_CLI_SCRIPT ??
            "benchmark/stdio-renderer.ts",
        },
      },
    );

    const exitCode = await new Promise<number>((resolve) => {
      ruby.on("exit", (code) => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
      throw new Error(`Ruby benchmark exited with code ${exitCode}`);
    }
  } finally {
    await shutdown(server);
    await log.close();
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    console.error(`HTTP server log: ${await fs.readFile(LOG_FILE, "utf8")}`);
  } catch {
    // ignore missing log
  }
  process.exit(1);
});
