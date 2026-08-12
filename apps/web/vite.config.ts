import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.LLM_SPACE_WEB_BASE ?? "/llm-space/";
const guestApiOrigin =
  process.env.GUEST_API_ORIGIN ?? "http://127.0.0.1:8791";

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Preserve the browser range used by Vite 6 instead of silently adopting
    // the newer Vite 8 baseline during this build-tool migration.
    target: ["chrome87", "edge88", "firefox78", "safari14"],
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      [`${base}api`]: {
        target: guestApiOrigin,
        changeOrigin: true,
        rewrite: (requestPath) =>
          requestPath.slice(base.length - 1),
      },
    },
  },
});
