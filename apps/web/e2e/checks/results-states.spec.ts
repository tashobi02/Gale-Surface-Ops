/** SCR-05 states (T09.01–T09.05). Uses F2 canned results; absent samples remain honest dashes. */
import { expect, test } from "@playwright/test";

for (const f of [
  { result: "ok", word: "OK" },
  { result: "partial", word: "Partial" },
  { result: "over-limits", word: "Over limits" },
]) test(`results-states: ${f.word} banner, seven metrics, profile and warnings`, async ({ page }) => {
  await page.goto(`/?site=mock_site&mock_worker=1&mock_worker_result=${f.result}#/planner`);
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await page.getByLabel(/EVA start/i).fill("2026-11-14T08:00:00Z");
  await page.locator(".ol-viewport").focus();
  await page.keyboard.press("a");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /snap/i }).click();
  const panel = page.getByRole("region", { name: "Route results", exact: true });
  await expect(panel.locator("[data-results-banner]")).toContainText(f.word);
  await expect(panel.locator("[data-results-banner] .status-glyph")).toBeVisible();
  await expect(panel.locator(".scr05-metric")).toHaveCount(7);
  await expect(panel.locator("[data-profile]")).toBeVisible();
  await expect(panel).not.toContainText("Profile unavailable");
  if (f.result === "partial") {
    await expect(panel.locator("[data-totals-hidden]")).toHaveAttribute("data-totals-hidden", "true");
    await expect(panel.locator(".profile-no-route").first()).toContainText("NO ROUTE");
  }
  for (const band of ["haven", "comm"]) await expect(panel.locator(`[data-band="${band}"]`)).toBeVisible();
  await expect(panel.getByRole("region", { name: "Route warnings" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse results panel" }).click();
  await expect(panel.locator("[data-results-banner]")).toBeVisible();
});
