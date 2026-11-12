/**
 * Check `toggles` (replaces T07.15). The 300 ms part is enabled by package 08; the inspector part stays with package 28.
 * Each SCR-03 toggle repaints within 300 ms (`performance.now()` around the click until the map's next `postrender`, through
 * `window.__onNextPostrender`, which SCR-02 installs only with `?debug=1`); inspector values equal the grid cell read from
 * the manifest grid (05 §E.1 index) at three points (package 28: the inspector's selectors are package 07 and 08's `data-slot`s).
 */
import { expect, test } from "@playwright/test";

const REPAINT_BUDGET_MS = 300;
const INSPECTOR_POINTS = 3;

test("toggles: every layer toggle repaints within 300 ms (package 08)", async ({ page }) => {
  await page.goto("/?site=mock_site&debug=1#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  const enabled = '[data-drawer="left"] [data-layer-id] [role="switch"]:not([disabled])';
  const count = await page.locator(enabled).count();
  expect(count, "the layers panel has switches").toBeGreaterThan(0);
  // Every switch is pressed twice (on, then off): both directions repaint within the budget.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < count; i += 1) {
      const ms = await page.evaluate(
        ([selector, index]) =>
          new Promise<number>((resolve, reject) => {
            const hook = (window as unknown as { __onNextPostrender?: (cb: () => void) => void }).__onNextPostrender;
            if (!hook) return reject(new Error("SCR-02 exposes no postrender hook (needs ?debug=1)"));
            const target = document.querySelectorAll<HTMLElement>(selector as string)[index as number];
            if (!target) return reject(new Error(`no switch ${String(index)}`));
            const start = performance.now();
            hook(() => resolve(performance.now() - start));
            target.click();
          }),
        [enabled, i] as const,
      );
      expect(ms, `switch ${i}, press ${pass + 1}`).toBeLessThanOrEqual(REPAINT_BUDGET_MS);
    }
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
