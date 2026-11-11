import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Relative base so the build runs from the Hab Core or any static folder offline (NFR-01).
// In dev, site data, the REST API and the WebSocket come from a local Hab Core (npm run hab:start).
const HAB = process.env.HAB_URL ?? "http://127.0.0.1:8080";

/**
 * Dev server only: the React refresh preamble is an inline script, so the dev page's CSP allows inline script. The built
 * page (`vite build`, served by the Hab Core) keeps the strict policy in index.html (NFR-08).
 */
function devInlineScript(): Plugin {
  return {
    name: "marswalk-dev-inline-script",
    apply: "serve",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';"),
    },
  };
}

// React + Vite (ADR-012): static build, no server rendering.
export default defineConfig({
  plugins: [react(), devInlineScript()],
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
