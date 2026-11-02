import { defineConfig } from "vitest/config";

// Relative base so the built app runs from any static folder or file server offline (NFR-01).
export default defineConfig({
  base: "./",
  test: { include: ["tests/**/*.test.ts"] },
});
