/**
 * Check `fallbacks-planner` (replaces the manual Verify lines of T02.06, T07.16, T09.08 and T11.06; package 33, FD-193).
 * Every test BREAKS the primary path and proves that the degraded path works and says so on screen, in words with a shape:
 *  - the XYZ tile pyramid is refused: the ortho becomes an ImageStatic of its coarsest tile, a 2 m overlay becomes the pipeline's
 *    declared PNG, and a layer with neither stays an unavailable row while the other layers keep drawing;
 *  - the worker has no `VALIDATE_MANUAL_LEG` handler (N-25): the manual-leg panel sends the request from the keyboard and from the
 *    pointer, shows only what the worker answered, and shows "—" and "Unavailable" when it answered an error.
 * The briefing card's canvas-export failure is in `print` (one page) and `axe`; the same failures with no external request are in `offline`.
 * Desktop 1440 only: the three-column layout shows the layers drawer and the results panel together.
 */
import { expect, test, type Page } from "@playwright/test";
import { guardNetwork, expectNoExternal } from "../lib/offline";
import { addStopByKeyboard, openPlanTab } from "../lib/planner";
import { answerPlansWithNoRoute, asOrtho, declareStaticImage, failTiles, manualLegRequests, paintedPixels, STATIC_PNG_SIZE, stubManualLegWorker } from "../lib/fallbacks";

const ROW = '[data-drawer="left"] [data-layer-id]';
const row = (page: Page, id: string) => page.locator(`${ROW}[data-layer-id="${id}"]`);
const PANEL = '[data-slot="draw-legs"]';

async function openPlanner(page: Page): Promise<void> {
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
}

test("fallbacks: the ortho falls back to an ImageStatic of its coarsest tile when the tile pyramid is refused (T02.06, T07.16)", async ({ page }) => {
  const guard = await guardNetwork(page);
  await asOrtho(page);
  const attempts = await failTiles(page, "elevation", { keepCoarsest: true });
  await openPlanner(page);

  const notice = page.locator('[data-slot="layer-fallback-notice"] .notice[data-status="caution"]');
  await expect(notice).toContainText(/tiles did not load, so this layer is drawn from a fallback image/);
  await expect(notice.locator(".status-glyph")).toBeVisible(); // a shape beside the word, not colour alone
  await expect(notice.locator('.metric-value[data-provenance="derived"]')).toHaveText("32");

  const fallback = row(page, "elevation").locator('[data-slot="layer-fallback"]');
  await expect(fallback).toContainText("FALLBACK IMAGE");
  await expect(fallback).toContainText(/coarsest tile as one image/);
  await expect(row(page, "elevation")).toHaveAttribute("data-state", "ready");
  await expect(row(page, "elevation").getByRole("switch")).toBeEnabled();

  expect(attempts.refused.length, "the pyramid was attempted and refused").toBeGreaterThan(0);
  await expect.poll(() => guard.responses.some((r) => r.url.endsWith("/tiles/elevation/0/0/0.png") && r.status === 200), "the coarsest image answered").toBe(true);
  await expect.poll(() => paintedPixels(page, ".marswalk-ortho canvas, canvas.marswalk-ortho"), "the image stand-in is on the map").toBeGreaterThan(0);
  expectNoExternal(guard);
});

test("fallbacks: a scientific overlay falls back to the pipeline's declared PNG over the AOI (T07.16)", async ({ page }) => {
  const guard = await guardNetwork(page);
  const images = await declareStaticImage(page, "elevation");
  await failTiles(page, "elevation", { keepCoarsest: false });
  await openPlanner(page);
  await row(page, "elevation").getByRole("switch").click();

  const fallback = row(page, "elevation").locator('[data-slot="layer-fallback"]');
  await expect(fallback).toContainText("FALLBACK IMAGE");
  await expect(fallback).toContainText(/the static image/);
  // 6000 m of AOI over the PNG's 16 pixels: 375 m per pixel, a number with its provenance and source.
  const size = fallback.locator('.metric-value[data-provenance="derived"][data-source="layer.elevation.tile_grid"]');
  await expect(size).toHaveText(String(6000 / STATIC_PNG_SIZE));
  await expect(row(page, "elevation")).toHaveAttribute("data-state", "ready");
  expect(images.length, "only the declared image was requested").toBeGreaterThan(0);
  await expect.poll(() => paintedPixels(page, ".ol-viewport canvas"), "the PNG is on the map").toBeGreaterThan(0);
  await expect(page.locator('[data-slot="layer-fallback-notice"] .notice')).toContainText(/Elevation \(placeholder\): tiles did not load/);
  expectNoExternal(guard);
});

test("fallbacks: a layer that cannot load shows an unavailable row and the other layers keep drawing (FR-16)", async ({ page }) => {
  const guard = await guardNetwork(page);
  await failTiles(page, "slope", { keepCoarsest: false }); // no declared PNG and not the ortho: nothing can stand in for it
  await openPlanner(page);
  await row(page, "slope").getByRole("switch").click();

  const slope = row(page, "slope");
  await expect(slope).toHaveAttribute("data-state", "unavailable");
  await expect(slope.locator('[data-slot="layer-reason"]')).toContainText(/Unavailable: the tile set "tiles-slope" is missing or did not load/);
  await expect(slope.getByRole("switch")).toBeDisabled();
  await expect(slope.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(slope.locator('[data-slot="layer-fallback"]')).toHaveCount(0); // it does not pretend to have a stand-in
  await expect(page.locator('[data-slot="layer-fallback-notice"] .notice')).toHaveAttribute("data-empty", "true");

  await row(page, "elevation").getByRole("switch").click();
  await expect(row(page, "elevation")).toHaveAttribute("data-state", "ready");
  await expect.poll(() => paintedPixels(page, ".ol-viewport canvas")).toBeGreaterThan(0);
  expectNoExternal(guard);
});

/** Places the start and two stops, then opens the manual-leg panel the `?draw_legs=1` flag shows. */
async function planWithLegPanel(page: Page): Promise<void> {
  await openPlanTab(page, "&draw_legs=1");
  await addStopByKeyboard(page, 1);
  await addStopByKeyboard(page, 2);
  await expect(page.locator(PANEL)).toBeVisible();
}

const status = (page: Page) => page.locator(`${PANEL} [data-slot="manual-leg-status"]`);
const legButtons = (page: Page) => page.locator(`${PANEL} .scr02-manual-actions button`);

test("fallbacks: a manual leg is drawn from the keyboard and from the pointer, sent as VALIDATE_MANUAL_LEG and shown as the worker answered (T09.08, FD-125)", async ({ page }) => {
  const guard = await guardNetwork(page);
  await stubManualLegWorker(page);
  await planWithLegPanel(page);

  // Before any answer, no number: the leg's walk time and the plan totals read "—" (never computed in the page).
  await expect(page.locator(`${PANEL} .metric-value[data-unavailable="true"]`)).toHaveCount(2);

  // Keyboard: pan the crosshair, place a vertex with Enter, finish.
  await legButtons(page).first().click();
  await expect(status(page)).toContainText("Drawing");
  await expect(page.locator('[data-slot="crosshair"]')).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Finish leg" }).click();
  await expect(status(page)).toContainText("Leg validation");
  const walk = page.locator(`${PANEL} .metric-value[data-source="worker:MANUAL_LEG_RESULT.leg.walk_time_min"]`);
  await expect(walk).toHaveText("22"); // the stub said 21.5; the metric shows whole minutes
  await expect(walk).toHaveAttribute("data-provenance", "modelled");
  // The plan's totals stay "—": no totals are manufactured from one validated leg.
  await expect(page.locator(`${PANEL} .metric-value[data-source="unavailable:manual-plan-totals"]`)).toHaveText("—");
  await expect(page.locator(`${PANEL} svg`).first()).toBeVisible(); // the profile of the validated leg

  // Pointer: the same leg again, drawn with clicks and a double-click to finish.
  await legButtons(page).first().click();
  const box = (await page.locator(".ol-viewport").boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  for (const [fx, fy] of [[0.3, 0.3], [0.4, 0.45], [0.5, 0.4]] as const) await page.mouse.click(at(fx, fy).x, at(fx, fy).y);
  await page.mouse.dblclick(at(0.6, 0.5).x, at(0.6, 0.5).y);
  await expect.poll(async () => (await manualLegRequests(page)).length).toBe(2);

  const [keyboard, pointer] = await manualLegRequests(page);
  for (const request of [keyboard!, pointer!]) {
    expect(request.type).toBe("VALIDATE_MANUAL_LEG");
    expect(request.from).toBe("wp-0");
    expect(request.to).toBe("wp-1");
    expect(request.request_id).toMatch(/^manual-leg-/);
    expect(request.scenario).toHaveProperty("caution_slope_deg");
    expect(request.vertices[0], "the first vertex is snapped to the start").toEqual([-1800, -1500]);
  }
  expect(keyboard!.vertices).toHaveLength(3); // start, the Enter vertex, the stop
  expect(pointer!.vertices.length, "start, at least one drawn vertex, the stop").toBeGreaterThanOrEqual(3);
  expect(pointer!.vertices.at(-1), "the last vertex is snapped to the stop").toEqual(keyboard!.vertices.at(-1));
  expect(keyboard!.vertices[1]).not.toEqual(pointer!.vertices[1]);
  expectNoExternal(guard);
});

test("fallbacks: Escape cancels a manual leg and sends nothing (T09.08)", async ({ page }) => {
  await stubManualLegWorker(page);
  await planWithLegPanel(page);
  await legButtons(page).first().click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(status(page)).toContainText("Ready");
  await expect(page.getByRole("button", { name: "Finish leg" })).toBeDisabled();
  expect(await manualLegRequests(page)).toEqual([]);
});

test("fallbacks: the manual-leg panel opens by itself when the worker finds no route anywhere, and not for a routed plan (T09.08)", async ({ page }) => {
  // Primary path first: a routed plan on the F4 site shows no manual-leg panel.
  await openPlanTab(page);
  await addStopByKeyboard(page, 1);
  await expect(page.locator('[data-results-banner]')).toBeVisible();
  await expect(page.locator(PANEL)).toHaveCount(0);

  // Then break it: every plan comes back as NO ROUTE.
  const broken = await page.context().newPage();
  await answerPlansWithNoRoute(broken);
  await openPlanTab(broken);
  await addStopByKeyboard(broken, 1);
  await expect(broken.locator(PANEL)).toBeVisible();
  await expect(broken.locator(`${PANEL} .scr02-manual-actions button`).first()).toContainText(/^Draw /);
  await expect(broken.locator("[data-results-banner]")).toContainText(/Partial|No route/i);
  await broken.close();
});

test("fallbacks: with the real worker the manual-leg panel is honest about what it answered (T09.08, N-25)", async ({ page }) => {
  await planWithLegPanel(page);
  await legButtons(page).first().click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Finish leg" }).click();
  await expect(status(page)).not.toContainText(/Validating|Drawing|Ready/, { timeout: 15_000 });
  const walk = page.locator(`${PANEL} .metric-value[data-source="worker:MANUAL_LEG_RESULT.leg.walk_time_min"]`);
  if (/unavailable/i.test(await status(page).innerText())) {
    // The worker has no handler for the request (N-25): it said ERROR, the page says so and shows no number.
    await expect(status(page)).toContainText(/Manual-leg validation unavailable/);
    await expect(walk).toHaveCount(0); // no worker-sourced number exists
    await expect(page.locator(`${PANEL} .metric-value[data-unavailable="true"]`)).toHaveText(["—", "—"]);
  } else {
    // A backend that answers: the number is the worker's, labelled modelled with its source.
    await expect(status(page)).toContainText("Leg validation");
    await expect(walk).toHaveAttribute("data-provenance", "modelled");
    await expect(walk).not.toHaveText("—");
  }
  await expect(page.locator(`${PANEL} .metric-value[data-source="unavailable:manual-plan-totals"]`)).toHaveText("—");
});

test.fixme("needs N-160: the real worker validates a manual leg and the plan integrates it (T09.08)", async ({ page }) => {
  // Passes the moment the worker answers VALIDATE_MANUAL_LEG with a leg (N-25 handler) and the plan totals include it.
  await planWithLegPanel(page);
  await legButtons(page).first().click();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Finish leg" }).click();
  await expect(status(page)).toContainText("Leg validation");
  await expect(page.locator(`${PANEL} .metric-value[data-source^="unavailable:manual-plan-totals"]`)).toHaveCount(0);
});
