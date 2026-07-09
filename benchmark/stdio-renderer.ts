import { createRenderer } from "../universal-renderer/src/stdio";
import { renderBenchmarkPayload, type BenchmarkProps } from "./workload";

interface BenchmarkContext extends Record<string, unknown> {
  url: string;
  props: BenchmarkProps;
}

await createRenderer<BenchmarkContext>({
  setup: (url, props) => ({ url, props: props as BenchmarkProps }),
  render: ({ url, props }) => renderBenchmarkPayload(url, props),
});
