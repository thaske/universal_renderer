import { defineConfig } from "tsdown/config";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/express/index.ts",
    "src/hono/index.ts",
    "src/bun/index.ts",
    "src/fastify/index.ts",
    "src/uwebsocket/index.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  tsconfig: "tsconfig.json",
  sourcemap: true,
  clean: true,
});
