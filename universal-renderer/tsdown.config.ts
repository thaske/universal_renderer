import { defineConfig } from "tsdown/config";

export default defineConfig({
  entry: [
    "src/http/express/index.ts",
    "src/http/bun/index.ts",
    "src/stdio/bun/index.ts",
    "src/stdio/node/index.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  tsconfig: "tsconfig.json",
  sourcemap: true,
  clean: true,
});
