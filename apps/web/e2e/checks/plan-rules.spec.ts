/**
 * Check `plan-rules` (replaces T08.11). Enabled by package 28.
 * The 02 §E.3 rules in the UI: each invalid input shows its inline error and keeps the last valid value; an outside-AOI or
 * impassable placement is refused or snapped by at most 50 m; SCR-04 shows Empty, Editing, Invalid and Computing.
 */
import { expect, test } from "@playwright/test";

const MAX_SNAP_M = 50;

test.fixme("plan-rules: invalid inputs show an inline error and keep the last valid value (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/planner");
  await page.waitForLoadState("networkidle");
  const field = page.getByLabel(/max eva duration/i);
  const valid = await field.inputValue();
  await field.fill("-1");
  await field.blur();
  await expect(page.getByRole("alert").filter({ hasText: /duration/i })).toBeVisible();
  await expect(field).toHaveValue(valid);
});

// Package 10: the placement rules on the F4 site (60 x 60 cells of 100 m; its wall of 20-degree cells has x from 0 to 100 m and a gap at
// y from -100 to 0 only, so no passable cell centre lies within the 50 m snap radius of (50, 1000)). `?debug=1` installs `window.__tryPlace(x_m, y_m)`.
test("plan-rules: outside-AOI and impassable placements are refused, a passable one is placed (package 10)", async ({ page }) => {
  await page.goto("/?site=mock_site&debug=1#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.waitForFunction(() => typeof (window as unknown as { __tryPlace?: unknown }).__tryPlace === "function");
  type Tried = { outcome: string; added: { x_m: number; y_m: number } | null };
  const tryPlace = (x: number, y: number): Promise<Tried> =>
    page.evaluate(([px, py]) => (window as unknown as { __tryPlace: (x: number, y: number) => Promise<Tried> }).__tryPlace(px!, py!), [x, y]);
  const notice = page.locator('[data-slot="placement-notice"] [data-slot="notice"]');

  const outside = await tryPlace(99999, 0);
  expect(outside).toMatchObject({ outcome: "outside", added: null });
  await expect(notice).toContainText("Outside mapped area");

  const steep = await tryPlace(50, 1000);
  expect(steep).toMatchObject({ outcome: "refused", added: null });
  await expect(notice).toContainText(/Not walkable here \(slope [\d.]+° > [\d.]+° limit\)/);

  const ok = await tryPlace(-1000, 1000);
  expect(ok.outcome).toBe("placed");
  expect(ok.added).toEqual({ x_m: -1000, y_m: 1000 });
  await expect(notice).toHaveAttribute("data-empty", "true");
});

test.fixme("plan-rules: SCR-04 shows Empty, Editing, Invalid and Computing (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/planner");
  for (const state of ["Empty", "Editing", "Invalid", "Computing"]) {
    await page.goto(`/#/planner?mock_state=${state.toLowerCase()}`);
    await expect(page.locator("[data-plan-state]")).toHaveAttribute("data-plan-state", state.toLowerCase());
  }
});
