import { defineConfig } from "tsdown/config";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/http/index.ts",
    "src/dev.ts",
    "src/vite.ts",
    "src/react-query.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  tsconfig: "tsconfig.json",
  sourcemap: true,
  clean: true,
});
