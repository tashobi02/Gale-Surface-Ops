import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
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
      handler: (html) => {
        const strict = "default-src 'self';";
        if (!html.includes(strict)) throw new Error("index.html CSP no longer starts with default-src 'self'; update devInlineScript");
        return html.replace(strict, "default-src 'self'; script-src 'self' 'unsafe-inline';");
      },
    },
  };
}

/**
 * The T02.03 spike page is built only for the verification harness (`MARSWALK_SPIKE=1`, set by e2e/globalSetup.ts), so the
 * `tiles-all-levels` and `scale-bar` checks can load it from the Hab Core; the demo build never contains it.
 */
const spikeInput =
  process.env.MARSWALK_SPIKE === "1"
    ? { main: fileURLToPath(new URL("./index.html", import.meta.url)), spike: fileURLToPath(new URL("./spike/index.html", import.meta.url)) }
    : undefined;

// React + Vite (ADR-012): static build, no server rendering.
export default defineConfig({
  plugins: [react(), devInlineScript(), {
    name: "copy-replay-recording",
    apply: "build",
    closeBundle() {
      const recording = fileURLToPath(new URL("../../scenarios/storm-sol4190/recording.json", import.meta.url));
      if (!existsSync(recording)) return;
      const destination = resolve(import.meta.dirname, "dist/replay");
      mkdirSync(destination, { recursive: true });
      copyFileSync(recording, resolve(destination, "recording.json"));
    },
  }],
  base: "./",
  build: spikeInput ? { rollupOptions: { input: spikeInput } } : {},
  server: {
    host: true,
    proxy: {
      "/sites": HAB,
      "/api": HAB,
      "/ws": { target: HAB.replace(/^http/, "ws"), ws: true },
    },
  },
  // Vitest runs only tests/; the Playwright harness in e2e/ is run by `make e2e`, never by `make test-web`.
  test: { include: ["tests/**/*.test.ts"] },
});
