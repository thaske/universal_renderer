import { defineConfig } from "vite";
import RubyPlugin from "vite-plugin-ruby";

export default defineConfig({
  plugins: [RubyPlugin()],
  resolve: {
    // The SSR entrypoint loads the renderer through Vite as well as the app.
    // Dedupe React so both sides of that module graph use this app's copy.
    dedupe: ["react", "react-dom"],
  },
  ssr: {
    noExternal: ["universal-renderer"],
  },
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
});
