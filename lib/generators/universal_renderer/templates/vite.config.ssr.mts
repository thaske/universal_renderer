import react from "@vitejs/plugin-react";
import { defineSsrConfig } from "universal-renderer/vite";

// Standalone SSR build. defineSsrConfig handles the four settings that are wrong
// by default for a Rails SSR build; read its docs before overriding them.
//
// Note what is absent: vite-plugin-rails, which targets the client manifest
// pipeline and overrides entrypoints and outDir. Your client build keeps using
// vite.config.mts, unchanged.
export default defineSsrConfig({
  entry: "<%= frontend_dir %>/ssr/server.ts",
  plugins: [react()],
});
