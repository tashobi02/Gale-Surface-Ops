/**
 * Regression check: SCR-02 planner drawers and top bar at phone landscape, phone portrait, tablet and desktop.
 * Asserts no horizontal overflow, tappable drawer toggles, and that controls at the bottom of the right drawer
 * (Add as stop) are scrollable into view and clickable even while first-run coach marks are open.
 */
import { expect, test } from "@playwright/test";

test("planner-drawer: right drawer Add as stop is reachable by scrolling and clickable without interception", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();

  const viewportWidth = page.viewportSize()!.width;
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, "planner workspace fits viewport width without horizontal overflow").toBeLessThanOrEqual(viewportWidth);

  const leftToggle = page.locator('[data-slot="drawer-toggle"][data-for="left"]');
  if (await leftToggle.isVisible()) {
    await leftToggle.click();
    await expect(page.locator('[data-drawer="left"]')).toBeVisible();
    await page.getByRole("tab", { name: "Plan", exact: true }).click();
    await page.getByLabel(/EVA start/i).fill("2026-11-14T08:00:00Z");
  }

  const poiId = await page.locator("button[data-poi-id]").first().getAttribute("data-poi-id");
  expect(poiId).toBeTruthy();
  const poi = page.locator(`button[data-poi-id="${poiId}"]`);
  await poi.focus();
  await poi.press("Enter");

  const rightDrawer = page.locator('[data-drawer="right"]');
  await expect(rightDrawer).toBeVisible();
  const detail = page.getByRole("region", { name: "POI detail", exact: true });
  await expect(detail).toBeVisible();

  const addAsStop = detail.getByRole("button", { name: "Add as stop" });
  await addAsStop.click();
  await expect(detail.getByRole("button", { name: "Remove stop" })).toBeVisible();

  if (await leftToggle.isVisible()) {
    await leftToggle.click();
    await expect(page.locator('[data-drawer="left"]')).toBeVisible();
  }
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await expect(page.locator('[data-waypoint-id="wp-1"]')).toBeVisible();
});
