import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: "es2022",
      rollupOptions: {
        input: {
          options: "src/options/options.html",
          offscreen: "src/offscreen/offscreen.html",
        },
        output: {
          // onnxruntime requests its WASM binary by this stable filename.
          assetFileNames: (asset) => asset.name?.endsWith(".wasm") ? "assets/[name][extname]" : "assets/[name]-[hash][extname]",
        },
      },
  },
});
