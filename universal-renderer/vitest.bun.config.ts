import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/http/bun/index.test.ts", "src/stdio/bun/index.test.ts"],
    exclude: ["node_modules", "dist"],
    // Run Bun tests sequentially to avoid server singleton conflicts
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{js,ts,jsx,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{js,ts,jsx,tsx}",
        "src/test/**/*",
        "src/**/*.d.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
