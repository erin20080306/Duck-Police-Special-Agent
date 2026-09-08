import { defineConfig } from "vite";
import { offlineGame } from "./build/pwa.js";
export default defineConfig({
  plugins: [offlineGame()],
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
});
