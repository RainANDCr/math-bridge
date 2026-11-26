import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5183,
    host: "127.0.0.1",
  },
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    pool: "threads",
  },
});
