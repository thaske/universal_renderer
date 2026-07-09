namespace :universal_renderer do
  desc "Benchmark HTTP vs Stdio SSR performance"
  task benchmark: :environment do
    sh "npm run benchmark --workspace benchmark"
  end

  desc "Analyze the most recent HTTP vs Stdio benchmark report"
  task analyze_benchmark: :environment do
    sh "npm run analyze --workspace benchmark"
  end

  desc "Smoke test Stdio through the benchmark harness"
  task test_stdio: :environment do
    sh "SCENARIOS=basic ITERATIONS=1 WARMUP=1 BASIC_ITEMS=1 npm run benchmark --workspace benchmark"
  end
end
