import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        typer: fileURLToPath(new URL("./index.html", import.meta.url)),
        statistics: fileURLToPath(new URL("./statistics/index.html", import.meta.url)),
      },
    },
  },
  test: { environment: "jsdom" },
});
