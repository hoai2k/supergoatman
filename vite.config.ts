import { defineConfig } from "vite";

// Relative base so the built site works both on GitHub Pages (project subpath)
// and when opened locally / previewed.
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true,
  },
});
