/**
 * Check `axe` (replaces T13.09). Enabled by package 03 (shell) and by each screen package for its route.
 * axe-core in real Chromium, tags wcag2a, wcag2aa, wcag21aa: zero serious or critical violations on every built route, in its
 * mode, and on each EVA and ops state fixture (FD-151). The full result of each scan goes to `out/axe-<route>.json`.
 */
import { test } from "@playwright/test";
import { axeScan, type HtmlMode } from "../lib/a11y";
import { waitForSnapshot } from "../lib/hab";
import { routeHashes } from "../lib/offline";

const LIVE = /^#\/(ops|eva|hud)/;

test.fixme("axe: every built route has no serious or critical violation (enabled by package 03 and each screen package)", async ({ page }, testInfo) => {
  for (const hash of routeHashes()) {
    await page.goto(`/${hash}`);
    await page.waitForLoadState("networkidle");
    if (LIVE.test(hash)) await waitForSnapshot(page);
    const mode = (await page.evaluate(() => document.documentElement.dataset.mode)) as HtmlMode;
    await axeScan(page, { mode, route: `${testInfo.project.name}-${hash}` });
  }
});
