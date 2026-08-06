import react from "@vitejs/plugin-react";
import { defineSsrConfig } from "universal-renderer/vite";

// Standalone SSR build.
//
// defineSsrConfig handles the four settings that are each wrong by default for a
// Rails SSR build and each fail silently — read its docs before overriding them.
//
// Note what is *absent*: vite-plugin-rails. That plugin is built for the client
// manifest pipeline and overrides entrypoints and outDir. List only the plugins
// the render itself needs. Your client build keeps using vite.config.mts,
// unchanged.
export default defineSsrConfig({
  entry: "<%= frontend_dir %>/ssr/server.ts",
  plugins: [react()],
});
