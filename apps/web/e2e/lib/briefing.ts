/** SCR-08 fixture through the public planner flow, retaining the mock-site query on hash navigation. */
import { expect, type Page } from "@playwright/test";
import { answerPlansWithNoRoute, failBriefingCanvasExport } from "./fallbacks";

export const BRIEFING_STATES = ["ok", "over-limits", "partial"] as const;
export async function openBriefing(
  page: Page,
  state: typeof BRIEFING_STATES[number] = "ok",
  options: { captureFails?: boolean; noRoute?: boolean } = {},
): Promise<void> {
  // Package 33: the canvas export throws a SecurityError, so the card must show the thumbnail with the route as SVG (T11.06).
  if (options.captureFails) await failBriefingCanvasExport(page);
  if (options.noRoute) await answerPlansWithNoRoute(page);
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
  if (options.captureFails) await expectBriefingFallback(page);
  else await expectBriefingMap(page);
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

/**
 * The degraded briefing map (T11.06, FD-137, FD-392): no canvas; a notice that names the failure with a shape and a word; the
 * site thumbnail (a file of the bundle, actually decoded) and the route as SVG with every stop numbered; dashes for NO ROUTE legs,
 * styled by the .css file (the CSP forbids inline styles).
 */
export async function expectBriefingFallback(page: Page): Promise<void> {
  const fallback = page.locator('.scr08-map [data-slot="map-fallback"]');
  await expect(fallback).toBeVisible();
  await expect(page.locator(".scr08-map canvas")).toHaveCount(0);
  const notice = page.locator('.scr08-map [data-slot="map-error"]');
  await expect(notice).toContainText(/Map snapshot unavailable: .*tainted/);
  await expect(notice).toContainText(/thumbnail with the route drawn as SVG/);
  await expect(notice.locator('[data-status="caution"] .status-glyph')).toBeVisible();
  await expect.poll(() => fallback.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth), "the thumbnail decoded").toBeGreaterThan(0);
  const svg = await fallback.locator("svg").evaluate((element) => ({
    stops: element.querySelectorAll("circle.stop").length,
    labels: element.querySelectorAll("text").length,
    dashed: [...element.querySelectorAll("polyline.route.no-route")].map((line) => getComputedStyle(line).strokeDasharray),
    solid: [...element.querySelectorAll("polyline.route:not(.no-route)")].map((line) => getComputedStyle(line).strokeDasharray),
  }));
  expect(svg.stops, "numbered stops").toBeGreaterThanOrEqual(2);
  expect(svg.labels).toBe(svg.stops);
  for (const dash of svg.dashed) expect(dash, "NO ROUTE legs are dashed by the stylesheet").not.toBe("none");
  for (const dash of svg.solid) expect(dash, "routed legs are solid").toBe("none");
}
