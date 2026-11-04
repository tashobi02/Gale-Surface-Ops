import { defineConfig } from "vitest/config";

// Relative base so the build runs from the Hab Core or any static folder offline (NFR-01).
// In dev, site data, the REST API and the WebSocket come from a local Hab Core (npm run hab:start).
const HAB = process.env.HAB_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  base: "./",
  server: {
    host: true,
    proxy: {
      "/sites": HAB,
      "/api": HAB,
      "/ws": { target: HAB.replace(/^http/, "ws"), ws: true },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
