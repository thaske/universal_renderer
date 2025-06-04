import fs from "fs/promises";
import path from "path";

const RESULTS_DIR = path.join(__dirname, "..", "tmp", "reports");
const SUMMARY_FILE = path.join(RESULTS_DIR, "summary.json");

interface BenchmarkMetrics {
  ttfb: number;
  domContentLoaded: number;
  fcp: number;
  lcp: number;
  loadTime: number;
  htmlBytes: number;
}

interface Stats {
  mean: number;
  median: number;
  p95: number;
  stdDev: number;
  count: number;
}

interface AggregatedVariantResult {
  variantName: string;
  metrics: Record<keyof BenchmarkMetrics, Stats>;
}

function calculateStats(numbers: number[]): Stats {
  if (numbers.length === 0) {
    return { mean: 0, median: 0, p95: 0, stdDev: 0, count: 0 };
  }
  numbers.sort((a, b) => a - b);

  const sum = numbers.reduce((acc, val) => acc + val, 0);
  const mean = sum / numbers.length;
  const median = numbers[Math.floor(numbers.length / 2)];

  const p95Index = Math.max(0, Math.ceil(numbers.length * 0.95) - 1);
  const p95 = numbers[p95Index];

  const variance =
    numbers.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
    numbers.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean,
    median,
    p95,
    stdDev,
    count: numbers.length,
  };
}

async function analyzeResults() {
  const overallSummary: AggregatedVariantResult[] = [];

  try {
    await fs.mkdir(RESULTS_DIR, { recursive: true }); // Ensure results dir exists
    const files = await fs.readdir(RESULTS_DIR);
    // Exclude summary.json itself from being processed as a raw report
    const jsonFiles = files.filter(
      (file) => file.endsWith(".json") && file !== "summary.json",
    );

    if (jsonFiles.length === 0) {
      console.log(
        `No JSON reports found in ${RESULTS_DIR} (excluding summary.json)`,
      );
      return;
    }

    console.log("Benchmark Results Analysis:");
    console.log("===========================");

    for (const jsonFile of jsonFiles) {
      const filePath = path.join(RESULTS_DIR, jsonFile);
      const fileContent = await fs.readFile(filePath, "utf-8");
      const results = JSON.parse(fileContent) as BenchmarkMetrics[];
      const variantName = jsonFile.replace(".json", "");

      if (results.length === 0) {
        console.log(`\nVariant: ${variantName} (No data)`);
        overallSummary.push({
          variantName,
          metrics: {} as Record<keyof BenchmarkMetrics, Stats>,
        }); // Add empty metrics for consistency
        continue;
      }

      const aggregatedMetrics: Record<keyof BenchmarkMetrics, Stats> =
        {} as Record<keyof BenchmarkMetrics, Stats>;

      (Object.keys(results[0]) as Array<keyof BenchmarkMetrics>).forEach(
        (metricKey) => {
          const values = results.map((r) => r[metricKey]);
          aggregatedMetrics[metricKey] = calculateStats(values);
        },
      );

      console.log(`\nVariant: ${variantName}`);
      console.table(aggregatedMetrics);
      overallSummary.push({ variantName, metrics: aggregatedMetrics });
    }

    // Save the overall summary
    await fs.writeFile(SUMMARY_FILE, JSON.stringify(overallSummary, null, 2));
    console.log(`\nAggregated summary saved to ${SUMMARY_FILE}`);
  } catch (error) {
    console.error("Error analyzing results:", error);
  }
}

analyzeResults();
