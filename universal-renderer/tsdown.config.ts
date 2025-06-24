import { defineConfig } from "tsdown/config";

export default defineConfig({
  entry: ["src/http/index.ts", "src/stdio/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  tsconfig: "tsconfig.json",
  sourcemap: true,
  clean: true,
});
