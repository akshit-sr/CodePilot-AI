import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./frontend", import.meta.url)),
  plugins: [react()],
  server: { proxy: { "/health": "http://127.0.0.1:8787", "/languages": "http://127.0.0.1:8787", "/review": "http://127.0.0.1:8787", "/usage": "http://127.0.0.1:8787", "/history": "http://127.0.0.1:8787" } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // web-tree-sitter's Emscripten loader evals code shipped inside the grammar .wasm files; that's expected.
    rolldownOptions: { onwarn: (w, warn) => w.code === "EVAL" && w.id?.includes("web-tree-sitter") ? undefined : warn(w) },
  }
});
