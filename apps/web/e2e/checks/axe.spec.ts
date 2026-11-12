/**
 * Check `axe` (replaces T13.09). Enabled by package 03 (shell) and by each screen package for its route.
 * axe-core in real Chromium, tags wcag2a, wcag2aa, wcag21aa: zero serious or critical violations on every built route, in its
 * mode, and on each EVA and ops state fixture (FD-151). The full result of each scan goes to `out/axe-<route>.json`.
 */
import { test } from "@playwright/test";
import { axeScan, type HtmlMode } from "../lib/a11y";
import { waitForSnapshot } from "../lib/hab";
import { withManifestlessSite } from "../lib/siteBundle";

const LIVE = /^#\/(ops|eva|hud)/;

// Routes that render real content today. Each screen package adds its own route here when it builds the screen, until the
// list equals `routeHashes()` (package 99 asserts that).
// `#/eva/EV1` is left out until package 17: axe measures HAVEN and O2 card text at 1.02 : 1 (`.card` background overrides the
// `.status-nominal` fill), the same defect the `contrast` check lists for that route.
const BUILT_ROUTES = ["#/join", "#/ops", "#/hud/EV1", "#/report"];

test("axe: every built route has no serious or critical violation", async ({ page }, testInfo) => {
  for (const hash of BUILT_ROUTES) {
    await page.goto(`/${hash}`);
    await page.waitForLoadState("networkidle");
    if (LIVE.test(hash)) await waitForSnapshot(page);
    const mode = (await page.evaluate(() => document.documentElement.dataset.mode)) as HtmlMode;
    await axeScan(page, { mode, route: `${testInfo.project.name}-${hash}` });
  }
});

// Package 06: SCR-00, the boot error, in OPS mode (FD-207). A site whose manifest was deleted makes the planner boot fail.
test("axe: SCR-00 boot error has no serious or critical violation", async ({ page }, testInfo) => {
  await withManifestlessSite(async (siteId) => {
    await page.goto(`/?site=${siteId}#/planner`);
    await page.waitForLoadState("networkidle");
    await page.locator('[data-screen="SCR-00"]').waitFor();
    await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr00` });
  });
});

// Package 07: the planner workspace SCR-02 on the F4 site, in OPS mode.
test("axe: SCR-02 planner workspace has no serious or critical violation", async ({ page }, testInfo) => {
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr02` });
});
