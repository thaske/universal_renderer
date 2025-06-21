import { Browser, chromium, Page, test } from "@playwright/test";
import { ChildProcess, spawn } from "child_process";
import fs from "fs/promises";
import getPort from "get-port";
import path from "path";

const WARMUP_RUNS = 5;
const MEASURED_RUNS = 30;
const RESULTS_DIR = path.join(__dirname, "..", "tmp", "reports");

interface BenchmarkMetrics {
  ttfb: number; // Time to First Byte
  domContentLoaded: number;
  fcp: number; // First Contentful Paint
  lcp: number; // Largest Contentful Paint
  loadTime: number; // Page load time
  htmlBytes: number;
}

interface ServerVariant {
  ssr: boolean;
  stream: boolean;
  server: "express" | "bun" | "uwebsocket";
  port: number;
}

async function launchServer(variant: ServerVariant): Promise<ChildProcess> {
  const serverPath = path.resolve(__dirname, "benchmark-server.ts");
  const args = [
    serverPath,
    "--ssr",
    String(variant.ssr),
    "--stream",
    String(variant.stream),
    "--server",
    variant.server,
    "--port",
    String(variant.port),
  ];

  const runtime = variant.server === "uwebsocket" ? "node" : "bun";
  const serverProcess = spawn(runtime, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  let stderrOutput = "";

  return new Promise((resolve, reject) => {
    serverProcess.stdout?.on("data", (data) => {
      const output = data.toString();
      if (output.includes(`running on http://localhost:${variant.port}`)) {
        resolve(serverProcess);
      }
    });

    serverProcess.stderr?.on("data", (data) => {
      const errorOutput = data.toString();
      stderrOutput += errorOutput;
      // console.error(`Server ${variant.server} stderr: ${errorOutput}`);
    });

    serverProcess.on("error", (err) => {
      reject(err);
    });

    serverProcess.on("exit", (code, signal) => {
      // If the process exits before resolving, it's an error, unless it was manually killed.
      // serverProcess.killed is true if we killed it.
      if (!serverProcess.killed) {
        reject(
          new Error(
            `Server exited prematurely with code ${code}, signal ${signal}. Stderr: ${stderrOutput}`,
          ),
        );
      }
    });

    setTimeout(() => {
      reject(new Error(`Server start timed out. Stderr: ${stderrOutput}`));
    }, 10000);
  });
}

async function shutdownServer(serverProcess: ChildProcess | null) {
  if (!serverProcess || typeof serverProcess.pid !== "number") {
    return Promise.resolve();
  }

  // Capture pid before the promise to ensure it's defined
  const pid = serverProcess.pid;

  if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const processGroupId = -pid; // Use captured pid
    let killTimeout: NodeJS.Timeout | undefined = undefined; // Initialize killTimeout

    const onExitListener = () => {
      if (killTimeout) {
        clearTimeout(killTimeout);
      }
      resolve();
    };
    serverProcess.once("exit", onExitListener);

    try {
      process.kill(processGroupId, "SIGTERM");
    } catch (e: any) {
      if (e.code === "ESRCH") {
        if (killTimeout) {
          clearTimeout(killTimeout);
        }
        serverProcess.removeListener("exit", onExitListener);
        resolve();
        return;
      } else {
        console.error(
          `Error sending SIGTERM to process group ${processGroupId}: ${
            e.message || e
          }`,
        );
      }
    }

    killTimeout = setTimeout(() => {
      if (
        serverProcess.exitCode === null &&
        serverProcess.signalCode === null
      ) {
        try {
          process.kill(processGroupId, "SIGKILL");
        } catch (e: any) {
          if (e.code !== "ESRCH") {
            console.error(
              `Error sending SIGKILL to process group ${processGroupId}: ${
                e.message || e
              }`,
            );
          }
        }
      }
      serverProcess.removeListener("exit", onExitListener);
      resolve();
    }, 2000);
  });
}

async function measurePage(page: Page, url: string): Promise<BenchmarkMetrics> {
  await page.goto(url, { waitUntil: "load" });

  const navEntry = JSON.parse(
    await page.evaluate(() =>
      JSON.stringify(performance.getEntriesByType("navigation")[0]),
    ),
  ) as PerformanceNavigationTiming;

  const paintMetrics = (await page.evaluate(() => {
    return new Promise<{ fcp: number; lcp: number }>((resolve) => {
      let fcpTime: number | undefined;
      let lcpTime: number | undefined;

      const observer = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === "first-contentful-paint") {
            fcpTime = entry.startTime;
          }
          if (entry.entryType === "largest-contentful-paint") {
            lcpTime = entry.startTime;
          }
        }

        // Resolve once both FCP and LCP are found, or after a timeout
        // LCP can sometimes be delayed, so we might need to wait a bit.
        // However, for benchmarking, we usually want the values available by 'load'.
        // If LCP is not available shortly after load, it might indicate an issue.
        if (fcpTime !== undefined && lcpTime !== undefined) {
          observer.disconnect();
          resolve({ fcp: fcpTime, lcp: lcpTime });
        }
      });

      observer.observe({ type: "paint", buffered: true });
      observer.observe({ type: "largest-contentful-paint", buffered: true });

      // Fallback: if metrics aren't found quickly, resolve with what we have.
      // This is important because LCP can be delayed.
      // For this benchmark, we expect them by the end of the load.
      // If they are not there, it's better to report 0 or an error
      // than to hang indefinitely.
      setTimeout(() => {
        observer.disconnect();
        // Try to get them one last time directly if not caught by observer
        if (fcpTime === undefined) {
          const fcpEntry = performance.getEntriesByName(
            "first-contentful-paint",
          )[0];
          if (fcpEntry) fcpTime = fcpEntry.startTime;
        }
        if (lcpTime === undefined) {
          const lcpEntries = performance.getEntriesByType(
            "largest-contentful-paint",
          );
          if (lcpEntries && lcpEntries.length > 0) {
            lcpTime = lcpEntries?.[lcpEntries.length - 1]?.startTime ?? 0;
          }
        }
        resolve({ fcp: fcpTime ?? 0, lcp: lcpTime ?? 0 });
      }, 500); // Wait up to 500ms after load for LCP
    });
  })) as { fcp: number; lcp: number };

  const html = await page.content();

  return {
    ttfb: navEntry.responseStart - navEntry.requestStart,
    domContentLoaded: navEntry.domContentLoadedEventEnd - navEntry.startTime,
    fcp: paintMetrics.fcp,
    lcp: paintMetrics.lcp,
    loadTime: navEntry.loadEventEnd - navEntry.startTime,
    htmlBytes: new TextEncoder().encode(html).length,
  };
}

test.describe("Page Load Benchmark", () => {
  let browser: Browser;

  test.beforeAll(async () => {
    browser = await chromium.launch();
    await fs.mkdir(RESULTS_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    await browser.close();
  });

  const variants: Omit<ServerVariant, "port">[] = [
    // { ssr: true, stream: false, server: "uwebsocket" },
    // { ssr: false, stream: false, server: "uwebsocket" },
    { ssr: true, stream: false, server: "express" },
    { ssr: true, stream: true, server: "express" },
    { ssr: false, stream: false, server: "express" }, // SSR off, stream should be irrelevant
    { ssr: true, stream: false, server: "bun" },
    { ssr: true, stream: true, server: "bun" },
    { ssr: false, stream: false, server: "bun" },
  ];

  for (const baseVariant of variants) {
    test(`Variant: ${baseVariant.server} SSR=${baseVariant.ssr} Stream=${baseVariant.stream}`, async () => {
      let serverProcess: ChildProcess | null = null;
      const port = await getPort();
      const variant: ServerVariant = { ...baseVariant, port };
      const results: BenchmarkMetrics[] = [];
      const variantName = `${variant.server}-ssr-${variant.ssr}-stream-${variant.stream}`;

      try {
        serverProcess = await launchServer(variant);
        const context = await browser.newContext({
          // Optional: Disable caching if needed for cleaner measurements
          // storageState: undefined, // Clears cookies, localStorage, etc.
          // serviceWorkers: 'block', // Blocks service workers
        });
        const page = await context.newPage();

        // Disable HTTP caching via routing for more consistent results
        await page.route("**/*", (route) => {
          const headers = { ...route.request().headers() };
          headers["Cache-Control"] = "no-store";
          route.continue({ headers });
        });

        const pageUrl = `http://localhost:${variant.port}/test-page`;

        // Warmup runs
        for (let i = 0; i < WARMUP_RUNS; i++) {
          await measurePage(page, pageUrl);
        }

        // Measured runs
        for (let i = 0; i < MEASURED_RUNS; i++) {
          results.push(await measurePage(page, pageUrl));
        }

        await context.close();
      } finally {
        await shutdownServer(serverProcess);
        // Save results
        if (results.length > 0) {
          await fs.writeFile(
            path.join(RESULTS_DIR, `${variantName}.json`),
            JSON.stringify(results, null, 2),
          );
        }
      }
    });
  }
});
