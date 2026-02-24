import { defineConfig } from "vite";
import RubyPlugin from "vite-plugin-ruby";

export default defineConfig({
  plugins: [RubyPlugin()],
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
});
