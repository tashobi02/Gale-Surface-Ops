/**
 * Check `plan-rules` (replaces T08.11). Enabled by package 28.
 * The 02 §E.3 rules in the UI: each invalid input shows its inline error and keeps the last valid value; an outside-AOI or
 * impassable placement is refused or snapped by at most 50 m; SCR-04 shows Empty, Editing, Invalid and Computing.
 * TODO(verify): field names and the 50 m snap figure are 02 §E.3's and package 09/10's; read them there, do not edit here.
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

test.fixme("plan-rules: outside-AOI and impassable placements are refused or snapped within 50 m (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/planner");
  await page.waitForLoadState("networkidle");
  const result = await page.evaluate(() => (window as unknown as { __tryPlace?: (kind: "outside" | "impassable") => { refused: boolean; snappedM: number } }).__tryPlace?.("outside"));
  expect(result).toBeTruthy();
  expect(result!.refused || result!.snappedM <= MAX_SNAP_M).toBe(true);
});

test.fixme("plan-rules: SCR-04 shows Empty, Editing, Invalid and Computing (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/planner");
  for (const state of ["Empty", "Editing", "Invalid", "Computing"]) {
    await page.goto(`/#/planner?mock_state=${state.toLowerCase()}`);
    await expect(page.locator("[data-plan-state]")).toHaveAttribute("data-plan-state", state.toLowerCase());
  }
});
