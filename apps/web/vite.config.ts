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
    // The UI package lazy-loads CodeMirror while the Web app imports editor
    // extensions from the same workspace source. Vite 8 can otherwise place a
    // second CodeMirror core instance in the lazy chunk, and extensions created
    // by one instance are rejected by the other at runtime.
    dedupe: [
      "react",
      "react-dom",
      "@codemirror/autocomplete",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/highlight",
      "@lezer/lr",
    ],
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
