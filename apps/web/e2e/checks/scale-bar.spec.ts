/**
 * Check `scale-bar` (replaces T02.04).
 * The scale line's metres per pixel equals the view resolution within 1 %. With `E2E_SITE=gale_boxwork` the T01.03 reference
 * crater, measured on the map between two rim points in projected metres, matches its DEM-measured size within 2 % at every
 * level where it is visible; on F4 only the resolution check runs (feasibility/dem-quality.md, FD-105).
 * The spike page exposes `window.__spike` (resolution, setZoom, setCenter, pixelOf); it is built only when `MARSWALK_SPIKE=1`.
 */
import { expect, test } from "@playwright/test";

const RESOLUTION_TOLERANCE = 0.01;
const CRATER_TOLERANCE = 0.02;

test("scale-bar: scale line equals the view resolution within 1 % at every level", async ({ page }) => {
  await page.goto("/spike/");
  await page.waitForLoadState("networkidle");
  const levels = await page.evaluate(() => {
    const spike = (window as unknown as { __spike?: { levels(): number } }).__spike;
    if (!spike) throw new Error("spike exposes no __spike hook (was the app built with MARSWALK_SPIKE=1?)");
    return spike.levels();
  });
  expect(levels).toBeGreaterThan(1);
  for (let z = 0; z < levels; z += 1) {
    await page.evaluate((level) => (window as unknown as { __spike: { setZoom(z: number): void } }).__spike.setZoom(level), z);
    // The scale line redraws on the next frame after the view changes, so poll for the render, then assert the tolerance.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const el = document.querySelector<HTMLElement>(".ol-scale-line-inner");
            const spike = (window as unknown as { __spike: { resolution(): number } }).__spike;
            if (!el?.textContent?.trim()) return Number.POSITIVE_INFINITY;
            const [value, unit] = el.textContent.trim().split(/\s+/);
            const metres = Number(value) * (unit === "km" ? 1000 : 1);
            const resolution = spike.resolution();
            return Math.abs(metres / el.getBoundingClientRect().width - resolution) / resolution;
          }),
        { message: `level ${z}: scale line vs view resolution`, timeout: 3000 },
      )
      .toBeLessThan(RESOLUTION_TOLERANCE);
  }
});

test.fixme("scale-bar: reference crater matches its DEM size within 2 % at every visible level (needs T03.19: the real gale_boxwork bundle)", async () => {
  test.skip(process.env.E2E_SITE !== "gale_boxwork", "needs the real site bundle (T03.19)");
  // Two rim points are picked on the map in projected metres; their distance is compared with the DEM-measured crater size
  // from docs/ops/feasibility/dem-quality.md (38.87 m rim to rim). The expected size is read from that document, not written
  // here, and the rim endpoints must first be converted to site coordinates with the manifest's own CRS. The spike exposes
  // `__spike.setZoom(z)`, `__spike.setCenter(x, y)` and `__spike.pixelOf(x, y)` for this.
  expect(CRATER_TOLERANCE).toBeGreaterThan(0);
});
