/**
 * Check `release-demo` (backend package 28: `make demo`, T14.09 built-file half; NFR-01, NFR-08, NFR-09, BD-152). Backend-owned.
 * `make demo` builds the production app and starts the Hab Core on 8080 with the real site and `storm-sol4190`. This spec runs it
 * (last, because it rebuilds `apps/web/dist` without the spike page), asks `GET /` and `GET /api/health`, then checks the built files:
 * the index.html carries the policy of packages/protocol/src/csp.ts and no inline script, no absolute external URL is in the build
 * (the namespace and documentation strings below are never requested and the policy would block them), the gzipped JavaScript is within
 * the NFR-09 figure (read from 02 §F), and the site bundle is within the NFR-09 bundle figure (apparent bytes, decimal MB: BD-111).
 * Skipped, with the reason, when the real bundle is absent or 8080 is taken.
 */
import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { REAL_SCENARIO, REAL_SITE } from "../lib/siteBundle";
import { REPO_ROOT, bundleBudgetMb, gzipBytes, jsBudgetKb } from "../lib/release";

const PORT = 8080;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DIST = join(REPO_ROOT, "apps", "web", "dist");
/** Hosts that appear in the build as text only: XML and JSON-schema namespaces, React's error-message links, a base for `new URL`. */
const TEXT_ONLY_HOSTS = new Set(["www.w3.org", "www.opengis.net", "react.dev", "json-schema.org", "localhost"]);

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path); // follows the links to the data SSD (BD-12)
    if (stat.isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

const healthy = (): Promise<boolean> => fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(2_000) }).then((r) => r.ok, () => false);

test("release-demo: make demo builds and serves; GET / and /api/health answer 200; the built files meet T14.09 and NFR-09", async ({ request }) => {
  test.setTimeout(420_000);
  const realBundle = existsSync(join(REPO_ROOT, "data", "sites", REAL_SITE, "site-manifest.json")) && existsSync(join(REPO_ROOT, "scenarios", REAL_SCENARIO, "scenario.json"));
  test.skip(!realBundle, "the real bundle (gale_boxwork, storm-sol4190) is absent");
  test.skip(await healthy(), `port ${PORT} already answers; stop that Hab Core first`);

  const child = spawn("make", ["demo"], { cwd: REPO_ROOT, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout?.on("data", (d: Buffer) => (output += d.toString()));
  child.stderr?.on("data", (d: Buffer) => (output += d.toString()));
  const stop = (): void => {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  };
  try {
    const deadline = Date.now() + 360_000;
    while (!(await healthy())) {
      if (child.exitCode !== null) throw new Error(`make demo exited with ${child.exitCode}:\n${output}`);
      if (Date.now() > deadline) throw new Error(`make demo did not answer on ${ORIGIN}/api/health in time:\n${output}`);
      await new Promise((r) => setTimeout(r, 1_000));
    }

    const root = await request.get(`${ORIGIN}/`);
    expect(root.status(), "GET /").toBe(200);
    expect(root.headers()["content-type"]).toContain("text/html");
    const health = await request.get(`${ORIGIN}/api/health`);
    expect(health.status(), "GET /api/health").toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });

    // the index.html of the build and the header of the server carry the one policy
    const csp = /export const CSP_META = "([^"]+)"/.exec(readFileSync(join(REPO_ROOT, "packages/protocol/src/csp.ts"), "utf8"))![1]!;
    const html = readFileSync(join(DIST, "index.html"), "utf8");
    expect(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1], "CSP meta of the built index.html").toBe(csp);
    expect(root.headers()["content-security-policy"], "CSP header of GET /").toBe(`${csp}; frame-ancestors 'none'`);
    expect(/<script(?![^>]*\ssrc=)[^>]*>/.test(html), "an inline script in the built index.html").toBe(false);

    // no absolute external URL in the build
    const textFiles = walk(DIST).filter((f) => /\.(js|css|html|json|svg|webmanifest)$/.test(f));
    const external = new Map<string, string>();
    for (const file of textFiles) {
      for (const [url] of readFileSync(file, "utf8").matchAll(/https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g)) {
        const host = new URL(url).hostname;
        if (!TEXT_ONLY_HOSTS.has(host)) external.set(`${host}`, `${url} in ${file.slice(DIST.length + 1)}`);
      }
    }
    expect([...external.values()], "absolute external URLs in apps/web/dist").toEqual([]);

    // sizes (NFR-09)
    const jsFiles = walk(DIST).filter((f) => f.endsWith(".js"));
    const gzipKb = jsFiles.reduce((sum, f) => sum + gzipBytes(f), 0) / 1000;
    test.info().annotations.push({ type: "js-gzip-kb", description: `${gzipKb.toFixed(1)} of ${jsBudgetKb()} (${jsFiles.length} files)` });
    expect(gzipKb, "gzipped JavaScript of the build, KB").toBeLessThanOrEqual(jsBudgetKb());
    const bundleBytes = walk(join(REPO_ROOT, "data", "sites", REAL_SITE)).reduce((sum, f) => sum + statSync(f).size, 0);
    test.info().annotations.push({ type: "bundle-mb", description: `${(bundleBytes / 1e6).toFixed(1)} of ${bundleBudgetMb()}` });
    expect(bundleBytes / 1e6, "site bundle, decimal MB").toBeLessThanOrEqual(bundleBudgetMb());
    expect(lstatSync(DIST).isDirectory()).toBe(true);
  } finally {
    stop();
  }
  await expect.poll(healthy, { message: "the Hab Core of make demo has stopped" }).toBe(false);
});
