import type { ExpressServerOptions } from "../../universal-renderer/src/http";
import { createServer as createExpressServer } from "../../universal-renderer/src/http";
import { renderBenchmarkPayload, type BenchmarkProps } from "./workload";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = yargs(hideBin(process.argv))
  .option("port", {
    type: "number",
    default: 3001,
    description: "Port to run the HTTP SSR benchmark server on.",
  })
  .help().argv;

interface BenchmarkContext extends Record<string, unknown> {
  url: string;
  props: BenchmarkProps;
}

async function main() {
  const { port } = await argv;

  const options: ExpressServerOptions<BenchmarkContext> = {
    setup: async (url, props) => ({ url, props: props as BenchmarkProps }),
    render: async (context) =>
      renderBenchmarkPayload(context.url, context.props),
    cleanup: async () => {
      // no-op; each workload handles its own per-render cleanup
    },
  };

  const app = await createExpressServer(options);
  app.listen(port, () => {
    console.log(`HTTP benchmark server running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start benchmark server:", err);
  process.exit(1);
});
