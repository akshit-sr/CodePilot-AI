import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./frontend", import.meta.url)),
  plugins: [react()],
  server: { proxy: { "/health": "http://127.0.0.1:8000", "/languages": "http://127.0.0.1:8000", "/review": "http://127.0.0.1:8000" } },
  build: { outDir: "dist", emptyOutDir: true }
});
