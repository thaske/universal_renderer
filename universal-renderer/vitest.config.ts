import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude: ["node_modules", "dist", "src/http/bun/index.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{js,ts,jsx,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{js,ts,jsx,tsx}",
        "src/test/**/*",
        "src/**/*.d.ts",
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
