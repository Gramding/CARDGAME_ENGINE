import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/* web/ holds the TypeScript pages; they build into site/ next to the playtester page that build.py
   writes. Relative asset paths keep the site working under /cardgame_engine/ on GitHub Pages. */
export default defineConfig({
  root: resolve(__dirname, "web"),
  base: "./",
  build: {
    outDir: resolve(__dirname, "site"),
    emptyOutDir: true,
    rollupOptions: { input: { import: resolve(__dirname, "web/import/index.html") } },
  },
  test: { root: __dirname, include: ["tests/unit/**/*.test.ts"] },
});
