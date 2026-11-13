/**
 * Check `release-csp` (backend package 28, T14.09 browser half; NFR-08, NFR-11). Backend-owned.
 * Every route of 03 §A loads with no `securitypolicyviolation` and no uncaught page error; the Hab Core sends the CSP header on
 * the page, the API and the site files, and the page's own meta tag is the same policy without `frame-ancestors`; `?debug=1`
 * shows its four items and a page without it shows none. The built files (no external URL, gzip size, bundle size) are
 * `release-demo`, which checks the production build that `make demo` makes.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeHashes } from "../lib/offline";
import { REPO_ROOT, collectCsp, e2eSiteId, watchFaults } from "../lib/release";

const CSP_SOURCE = readFileSync(join(REPO_ROOT, "packages/protocol/src/csp.ts"), "utf8");
const csp = (name: "CSP_META" | "CSP_HEADER"): string => {
  const meta = /export const CSP_META = "([^"]+)"/.exec(CSP_SOURCE)![1]!;
  return name === "CSP_META" ? meta : `${meta}; frame-ancestors 'none'`;
};

test("release-csp: every route loads with no CSP violation and no uncaught error", async ({ browser }) => {
  test.setTimeout(180_000);
  const violations: string[] = [];
  const errors: string[] = [];
  for (const hash of routeHashes()) {
    // A fresh context per route: a role route holds the one connection of its role (newest wins).
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const faults = await watchFaults(page);
    await page.goto(`/?site=${e2eSiteId()}${hash}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await collectCsp(page, faults);
    violations.push(...faults.cspViolations.map((v) => `${hash}: ${v}`));
    errors.push(...faults.pageErrors.map((e) => `${hash}: ${e}`));
    violations.push(...faults.consoleErrors.filter((m) => /Content Security Policy/i.test(m)).map((m) => `${hash}: ${m}`));
    await context.close();
  }
  expect(violations, "CSP violations").toEqual([]);
  expect(errors, "uncaught page errors").toEqual([]);
});

test("release-csp: the violation watcher itself sees a blocked cross-origin script (self-test)", async ({ page }) => {
  const faults = await watchFaults(page);
  await page.goto(`/?site=${e2eSiteId()}#/sources`);
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.src = "http://127.0.0.1:9/never.js";
    document.head.append(script);
  });
  await expect.poll(async () => { await collectCsp(page, faults); return faults.cspViolations.length; }).toBeGreaterThan(0);
  expect(faults.cspViolations.join(" ")).toContain("script-src");
});

test("release-csp: the header is on the page, the API and the site files, and the meta tag is the same policy", async ({ request }) => {
  const header = csp("CSP_HEADER");
  const site = e2eSiteId();
  for (const path of ["/", "/api/health", `/sites/${site}/site-manifest.json`]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-security-policy"], `CSP header on ${path}`).toBe(header);
  }
  const html = await (await request.get("/")).text();
  const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
  expect(meta, "CSP meta tag in the served index.html").toBe(csp("CSP_META"));
  expect(header).toBe(`${meta}; frame-ancestors 'none'`);
  expect(header).toContain("connect-src 'self'");
  expect(header).not.toMatch(/\bws:|\bwss:|unsafe-inline|unsafe-eval|\*/);
});

test("release-csp: ?debug=1 shows its four items and a page without it shows none (NFR-11)", async ({ page }) => {
  await page.goto(`/?site=${e2eSiteId()}&debug=1#/planner`);
  await page.locator('[data-slot="map-workspace"]').waitFor();
  const overlay = page.getByTestId("debug-overlay");
  await expect(overlay).toBeVisible();
  for (const name of ["fps", "worker", "cell", "data-version"]) {
    const row = overlay.locator(`[data-debug="${name}"]`);
    await expect(row, `debug item ${name}`).toBeVisible();
    await expect(row).toHaveAttribute("data-provenance", /^(measured|derived)$/);
  }
  await expect(overlay.locator("[data-debug]")).toHaveCount(4);
  await page.goto(`/?site=${e2eSiteId()}#/planner`);
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await expect(page.getByTestId("debug-overlay")).toHaveCount(0);
});

// Observed on 13 Nov 2026: `?debug=1` renders a <style> element (the overlay's print rule, apps/web/src/ui/debug.ts), which the policy
// blocks (`style-src-elem inline`, two reports per page). The overlay still shows; the print rule is lost. B-05 in
// docs/plan/backend/01-needs-from-frontend.md.
test("release-csp: ?debug=1 causes no CSP violation (B-05)", async ({ page }) => {
  const faults = await watchFaults(page);
  await page.goto(`/?site=${e2eSiteId()}&debug=1#/planner`);
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await collectCsp(page, faults);
  expect(faults.cspViolations).toEqual([]);
});
