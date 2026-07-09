# Benchmarks

Run the HTTP vs Stdio SSR benchmark:

```bash
npm run benchmark --workspace benchmark
# or
bundle exec rake universal_renderer:benchmark
```

Analyze the latest JSON report:

```bash
npm run analyze --workspace benchmark
# or
bundle exec rake universal_renderer:analyze_benchmark
```

The runner starts an HTTP SSR server, runs the Ruby adapters against the same workload, and writes `tmp/reports/http-vs-stdio.json`.

Open `results.html` in a browser to view the latest report:

```bash
npm run serve --workspace benchmark
```

## Scenarios

- `basic`: small non-React render, mostly adapter overhead.
- `props-heavy`: large nested props and large HTML response.
- `react-stack`: React SSR with `react-helmet-async`, `styled-components` SSR, and TanStack Query dehydration.

## Useful knobs

```bash
ITERATIONS=1000 WARMUP=50 npm run benchmark --workspace benchmark
SCENARIOS=react-stack REACT_STACK_ITEMS=250 npm run benchmark --workspace benchmark
PROPS_HEAVY_ITEMS=1000 SSR_STDIO_POOL_SIZE=2 npm run benchmark --workspace benchmark
```
