import fs from "fs/promises";
import path from "path";

const RESULTS_FILE = path.join(
  __dirname,
  "..",
  "..",
  "tmp",
  "reports",
  "http-vs-stdio.json",
);

interface AdapterResult {
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  rps: number;
  successes: number;
  nils: number;
  errors: number;
  response_bytes?: number;
}

interface ScenarioResult {
  scenario: string;
  item_count: number;
  props_bytes: number;
  results: {
    http: AdapterResult;
    stdio: AdapterResult;
  };
  comparison: {
    faster: "http" | "stdio" | null;
    average_latency_ratio: number | null;
  };
}

interface BenchmarkReport {
  generated_at: string;
  iterations: number;
  warmup: number;
  stdio_pool_size: number;
  scenarios: ScenarioResult[];
}

function ms(value: number) {
  return `${value.toFixed(3)}ms`;
}

async function analyzeResults() {
  const report = JSON.parse(
    await fs.readFile(RESULTS_FILE, "utf8"),
  ) as BenchmarkReport;

  console.log("UniversalRenderer HTTP vs Stdio Benchmark");
  console.log("=========================================");
  console.log(
    `generated=${report.generated_at} iterations=${report.iterations} warmup=${report.warmup} stdio_pool_size=${report.stdio_pool_size}`,
  );

  for (const scenario of report.scenarios) {
    const { http, stdio } = scenario.results;
    console.log(
      `\n${scenario.scenario} items=${scenario.item_count} props=${scenario.props_bytes} bytes`,
    );
    console.table({
      http: {
        avg: ms(http.avg_ms),
        p50: ms(http.p50_ms),
        p95: ms(http.p95_ms),
        p99: ms(http.p99_ms),
        rps: http.rps.toFixed(1),
        response: http.response_bytes,
        ok_nil_err: `${http.successes}/${http.nils}/${http.errors}`,
      },
      stdio: {
        avg: ms(stdio.avg_ms),
        p50: ms(stdio.p50_ms),
        p95: ms(stdio.p95_ms),
        p99: ms(stdio.p99_ms),
        rps: stdio.rps.toFixed(1),
        response: stdio.response_bytes,
        ok_nil_err: `${stdio.successes}/${stdio.nils}/${stdio.errors}`,
      },
    });

    if (
      scenario.comparison.faster &&
      scenario.comparison.average_latency_ratio
    ) {
      console.log(
        `winner: ${scenario.comparison.faster} by ${scenario.comparison.average_latency_ratio.toFixed(2)}x average latency`,
      );
    }
  }
}

analyzeResults().catch((error) => {
  console.error(`Could not analyze ${RESULTS_FILE}`);
  console.error(error);
  process.exit(1);
});
