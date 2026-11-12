/**
 * Check `poi-conditions` (replaces T10.03). Enabled by package 28.
 * POI images show their credit, sol, date and camera; a pre-dawn start shows the daylight warning (needs the real worker's
 * DARKNESS warning, N-26).
 */
import { expect, test } from "@playwright/test";

test.fixme("poi-conditions: POI images carry credit, sol, date and camera (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/planner");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /poi/i }).first().click();
  const detail = page.locator("[data-poi-detail]");
  await expect(detail.locator("[data-image-credit]")).not.toBeEmpty();
  for (const field of ["sol", "date", "camera"]) await expect(detail.locator(`[data-image-${field}]`)).not.toBeEmpty();
});

test.fixme("poi-conditions: a pre-dawn start shows the daylight warning (enabled by package 28, needs N-26)", async ({ page }) => {
  await page.goto("/#/planner");
  await page.getByLabel(/start time/i).fill("04:00");
  await expect(page.getByRole("alert").filter({ hasText: /dark|daylight/i })).toBeVisible();
});
