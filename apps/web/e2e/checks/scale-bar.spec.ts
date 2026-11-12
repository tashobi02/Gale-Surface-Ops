/**
 * Check `scale-bar` (replaces T02.04). Enabled by package 04.
 * The scale line's metres per pixel equals the view resolution within 1 %. With `E2E_SITE=gale_boxwork` the T01.03 reference
 * crater, measured on the map between two rim points in projected metres, matches its DEM-measured size within 2 % at every
 * level where it is visible; on F4 only the resolution check runs (feasibility/dem-quality.md, FD-105).
 * TODO(verify): the spike needs a read-only hook for the view resolution and the scale-line value (package 04).
 */
import { expect, test } from "@playwright/test";

const RESOLUTION_TOLERANCE = 0.01;
const CRATER_TOLERANCE = 0.02;

test.fixme("scale-bar: scale line equals the view resolution within 1 % (enabled by package 04)", async ({ page }) => {
  await page.goto("/spike/");
  await page.waitForLoadState("networkidle");
  const { metresPerPixel, resolution } = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".ol-scale-line-inner");
    const spike = (window as unknown as { __spike?: { resolution(): number } }).__spike;
    if (!el || !spike) throw new Error("spike exposes no scale line or view resolution");
    const [value, unit] = el.textContent!.trim().split(/\s+/);
    const metres = Number(value) * (unit === "km" ? 1000 : 1);
    return { metresPerPixel: metres / el.getBoundingClientRect().width, resolution: spike.resolution() };
  });
  expect(Math.abs(metresPerPixel - resolution) / resolution).toBeLessThan(RESOLUTION_TOLERANCE);
});

test.fixme("scale-bar: reference crater matches its DEM size within 2 % at every visible level (enabled by package 04, gale_boxwork only)", async () => {
  test.skip(process.env.E2E_SITE !== "gale_boxwork", "needs the real site bundle (T03.19)");
  // Two rim points are picked on the map in projected metres; their distance is compared with the DEM-measured crater size
  // from docs/ops/feasibility/dem-quality.md. The expected size is read from that document by package 04, not written here.
  expect(CRATER_TOLERANCE).toBeGreaterThan(0);
});
