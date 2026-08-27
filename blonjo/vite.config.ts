import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ["recharts"],
    // Exclude @huggingface/transformers dari pre-bundling
    // agar ONNX runtime bisa bekerja sebagai ESM yang murni di browser
    exclude: ["@huggingface/transformers"],
  },
  // Header CORS diperlukan agar ONNX WASM bisa pakai SharedArrayBuffer
  server: {
    port: 7500,
    host: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  // Agar build production tidak bundle ONNX runtime sebagai chunk raksasa
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes("@huggingface/transformers")) return "hf-transformers";
          return undefined;
        },
      },
    },
  },
})
