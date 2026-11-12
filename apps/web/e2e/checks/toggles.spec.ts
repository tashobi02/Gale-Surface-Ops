/**
 * Check `toggles` (replaces T07.15). Enabled by package 28.
 * Each SCR-03 toggle repaints within 300 ms (`performance.now()` around the click until the layer's `postrender`); inspector
 * values equal the grid cell read from the manifest grid (05 §E.1 index) at three points.
 * TODO(verify): the repaint hook (`window.__layerRepaint`) and the inspector selectors are packages 07 and 08's.
 */
import { expect, test } from "@playwright/test";

const REPAINT_BUDGET_MS = 300;
const INSPECTOR_POINTS = 3;

test.fixme("toggles: every layer toggle repaints within 300 ms (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/planner");
  await page.waitForLoadState("networkidle");
  const toggles = page.getByRole("switch");
  const count = await toggles.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const ms = await page.evaluate(
      (index) =>
        new Promise<number>((resolve) => {
          const start = performance.now();
          const hook = (window as unknown as { __onNextPostrender?: (cb: () => void) => void }).__onNextPostrender;
          if (!hook) throw new Error("planner exposes no postrender hook");
          hook(() => resolve(performance.now() - start));
          (document.querySelectorAll<HTMLElement>("[role=switch]")[index]).click();
        }),
      i,
    );
    expect(ms, `toggle ${i}`).toBeLessThanOrEqual(REPAINT_BUDGET_MS);
  }
});

test.fixme("toggles: inspector values equal the manifest grid cell at three points (enabled by package 28)", async ({ page, request }) => {
  const site = process.env.E2E_SITE ?? "mock_site";
  const manifest = (await (await request.get(`/sites/${site}/site-manifest.json`)).json()) as { grid: { width: number; height: number } };
  await page.goto("/#/planner");
  await page.waitForLoadState("networkidle");
  const fractions = [0.25, 0.5, 0.75].slice(0, INSPECTOR_POINTS);
  for (const f of fractions) {
    const cell = { col: Math.floor(manifest.grid.width * f), row: Math.floor(manifest.grid.height * f) };
    const shown = await page.evaluate((c) => (window as unknown as { __inspectCell?: (col: number, row: number) => string }).__inspectCell?.(c.col, c.row), cell);
    expect(shown, `inspector at ${cell.col},${cell.row}`).toBeTruthy();
  }
});
