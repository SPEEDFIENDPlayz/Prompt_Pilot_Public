import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: {
    target: "es2022",
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: (asset) => asset.name?.endsWith(".wasm") ? "assets/[name][extname]" : "assets/[name]-[hash][extname]",
      },
    },
  },
});
