/** SCR-08 fixture through the public planner flow, retaining the mock-site query on hash navigation. */
import { expect, type Page } from "@playwright/test";

export const BRIEFING_STATES = ["ok", "over-limits", "partial"] as const;
export async function openBriefing(page: Page, state: typeof BRIEFING_STATES[number] = "ok"): Promise<void> {
  const viewport = page.viewportSize();
  // Planner input is a desktop surface; the briefing is checked at the project's own viewport afterwards.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?site=mock_site&mock_worker=1&mock_worker_result=${state}#/`);
  await page.getByRole("button", { name: "Open demo plan", exact: true }).click();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await page.getByLabel(/EVA start/i).fill("2026-11-14T08:00:00Z");
  const word = state === "ok" ? "OK" : state === "partial" ? "Partial" : "Over limits";
  await expect(page.locator("[data-results-banner]")).toContainText(word);
  await page.evaluate(() => { window.location.hash = "#/briefing"; });
  await expect(page.locator('[data-slot="briefing-card"]')).toBeVisible();
  await expect(page.locator(".scr08-map img")).toBeVisible();
  await expect(page.locator(".scr08-map img")).toHaveJSProperty("complete", true);
  expect(await page.locator(".scr08-map img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  if (viewport) await page.setViewportSize(viewport);
}
