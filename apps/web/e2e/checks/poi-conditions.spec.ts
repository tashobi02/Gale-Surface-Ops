/** SCR-06/SCR-07 on F4; full image metadata is verified when the selected POI supplies it. */
import { expect, test, type Page } from "@playwright/test";

async function selectPoi(page: Page): Promise<void> {
  const poi = page.locator("button[data-poi-id]").first();
  await poi.focus();
  await poi.press("Enter");
}

test("poi-conditions: POI image metadata and honest missing-image state stay usable", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await selectPoi(page);
  const detail = page.locator("[data-poi-detail]");
  await expect(detail).toContainText("Science objective");
  await expect(detail.locator("[data-stop-type] svg polygon")).toBeVisible();
  for (const field of ["credit", "sol", "date", "camera"]) {
    await expect(detail.locator(`[data-image-${field}]`)).toHaveAttribute("data-provenance", "measured");
    await expect(detail.locator(`[data-image-${field}]`)).toHaveAttribute("data-source", /.+/);
  }
  await expect(detail.locator("[data-image-state]")).toHaveAttribute("data-image-state", /shown|missing/);
  const enlarge = detail.locator("[data-enlarge-image]");
  if (await enlarge.count()) {
    await expect(enlarge).toBeEnabled();
    await enlarge.click();
    await expect(detail.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(enlarge).toBeFocused();
    for (const field of ["credit", "sol", "date", "camera"]) await expect(detail.locator(`[data-image-${field}]`)).not.toContainText("—");
  } else {
    await expect(detail).toContainText("Image not available");
  }
  await expect(detail.getByRole("button", { name: "Add as stop" })).toBeEnabled();
  await detail.getByRole("button", { name: "Add as stop" }).click();
  await expect(detail.getByRole("button", { name: "Remove stop" })).toBeVisible();
  await detail.getByRole("button", { name: "Remove stop" }).click();
  await expect(detail.getByRole("button", { name: "Add as stop" })).toBeVisible();
});

test("poi-conditions: a pre-dawn start shows the real worker DARKNESS warning (N-26)", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  const start = page.getByLabel(/EVA start/i);
  await start.fill("2026-11-14T08:00:00Z");
  await selectPoi(page);
  await page.getByRole("button", { name: "Add as stop", exact: true }).click();
  await page.getByRole("tab", { name: "Conditions", exact: true }).click();
  const sunrise = page.locator('[data-condition="sunrise"] [data-condition-utc]');
  await expect(sunrise).toHaveAttribute("data-condition-utc", /T/);
  const suppliedSunrise = await sunrise.getAttribute("data-condition-utc");
  const ltst = page.locator('[data-condition="ltst-start"] dd');
  await expect(ltst).not.toContainText("—");
  const previousLtst = await ltst.innerText();
  // Drive the form one hour before the worker's own sunrise. The UI performs no solar calculation.
  await start.fill(new Date(Date.parse(suppliedSunrise!) - 60 * 60 * 1000).toISOString());
  await expect(ltst).not.toHaveText(previousLtst);
  await expect(page.getByRole("region", { name: "Conditions", exact: true })).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("alert", { name: "Daylight warning" })).toBeVisible();
  await expect(page.getByRole("alert", { name: "Daylight warning" })).toContainText("UTC");
});
