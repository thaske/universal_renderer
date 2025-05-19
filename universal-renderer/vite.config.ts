import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "react-dom/server": "react-dom/server.node",
    },
  },
});
