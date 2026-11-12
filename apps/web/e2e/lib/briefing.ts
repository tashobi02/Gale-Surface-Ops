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
  await expectBriefingMap(page);
  if (viewport) await page.setViewportSize(viewport);
}

/**
 * The briefing map is a canvas, not an image: the app's CSP is `default-src 'self'`, so a `data:` image source is
 * refused and an `<img>` would silently never appear (FD-363). The canvas is asserted by its painted pixels.
 */
export async function expectBriefingMap(page: Page): Promise<void> {
  const canvas = page.locator(".scr08-map canvas");
  await expect(canvas).toBeVisible();
  const painted = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d");
    if (!context || element.width === 0 || element.height === 0) return 0;
    const { data } = context.getImageData(0, 0, element.width, element.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
    return painted;
  });
  expect(painted, "the briefing map canvas has no painted pixels").toBeGreaterThan(0);
}
