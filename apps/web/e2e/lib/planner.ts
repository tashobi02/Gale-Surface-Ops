/**
 * Planner helpers shared by the checks (package 10): open the Plan tab, and put a stop on the plan by the keyboard alone, the way a
 * keyboard user does (`A`, then `Enter` at the crosshair; FD-117). The F4 site has a wall of 20-degree cells at x from 0 to 100 m, so
 * the map is panned west first.
 */
import { expect, type Page } from "@playwright/test";

/** Opens `#/planner` on the F4 site (plus `extraQuery`, e.g. `&draw_legs=1`), the left drawer (one-drawer layouts) and its Plan tab. */
export async function openPlanTab(page: Page, extraQuery = ""): Promise<void> {
  await page.goto(`/?site=mock_site${extraQuery}#/planner`);
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  const toggle = page.locator('[data-slot="drawer-toggle"][data-for="left"]');
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("tab", { name: "Plan" }).click();
  await page.locator('[data-slot="plan-panel"]').waitFor();
}

/** Adds one stop at the crosshair using only the keyboard; returns once the stop is in the stops list. */
export async function addStopByKeyboard(page: Page, nth: number): Promise<void> {
  await page.locator(".ol-viewport").focus();
  await page.keyboard.press(nth === 1 ? "ArrowLeft" : "ArrowDown");
  await page.keyboard.press("a");
  await page.keyboard.press("Enter");
  await expect(page.locator(`[data-waypoint-id="wp-${nth}"]`)).toBeVisible();
}
