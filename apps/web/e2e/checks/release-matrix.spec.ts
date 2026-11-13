/**
 * Check `release-matrix` (backend package 28, T14.08; NFR-03, BD-02, BD-152). Backend-owned.
 * The device matrix runs in Chromium with Playwright's device descriptors (desktop 1280, iPad Mini portrait 768 px, iPhone 14 portrait
 * 390 px); Firefox is not installed and no download fits the free disk, so it is logged "not tested" (BD-02).
 *  - desktop: the planning scenario of 01 §E.2 end to end (`runCoreScenario`);
 *  - tablet (768 px and wider, 01 §D Q-tablet): three stops, then one is deleted and the results follow;
 *  - phone (narrower than 768 px): the planner opens, the plan can be read and exported, and nothing throws. The app has no view-only
 *    mode (it is fully usable), which is more than the specification asks.
 * On every device one plan, the first POI as the only stop, is exported; the exports are normalised (no run time, no timings) and
 * compared across the three projects: the same inputs give the same JSON, plan_hash included.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR } from "../lib/a11y";
import { addPoiStopAndExport, collectCsp, placeStop, runCoreScenario, scenarioStops, watchFaults, withoutDebugOverlayStyle } from "../lib/release";

test.use({ actionTimeout: 15_000 });

// The device matrix runs on the F4 fixture whatever E2E_SITE says: it is small, its stops are exact, and the same plan must come out of every device.
const SITE = "mock_site";
const DIR = join(OUT_DIR, "release-matrix");
const MATRIX = ["desktop-1280", "tablet-portrait-768x1024", "phone-portrait-390x844"];

test("release-matrix: the device's own scenario runs and its plan export is the same on every device", async ({ page }, info) => {
  test.setTimeout(150_000);
  const faults = await watchFaults(page);
  const width = page.viewportSize()!.width;

  if (width >= 1024) {
    const result = await runCoreScenario(page, SITE);
    expect(result.steps.length, "the planning scenario steps").toBeGreaterThanOrEqual(6);
  } else if (width >= 768) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/?site=${SITE}&debug=1#/planner`);
    await page.waitForLoadState("networkidle");
    await page.locator('[data-slot="map-workspace"]').waitFor();
    const toggle = page.locator('[data-slot="drawer-toggle"][data-for="left"]');
    if (await toggle.isVisible()) await toggle.click();
    await page.getByRole("tab", { name: "Plan" }).click();
    const evaStart = page.getByLabel(/EVA start/i);
    await expect(evaStart).not.toHaveValue("", { timeout: 5_000 }).catch(() => undefined);
    await evaStart.fill("2026-11-14T08:00:00Z");
    for (const [x, y] of scenarioStops(SITE)) await placeStop(page, x, y);
    await expect(page.locator("[data-results-banner]")).toBeVisible();
    await page.getByRole("button", { name: "Delete stop 3" }).click();
    await expect(page.locator('[data-waypoint-id="wp-3"]')).toHaveCount(0);
    await expect(page.locator('[data-waypoint-id="wp-2"]')).toBeVisible();
    await expect(page.locator("[data-results-banner]")).toBeVisible();
  } else {
    await page.goto(`/?site=${SITE}#/planner`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-slot="map-workspace"]')).toBeVisible();
    await expect(page.locator('[data-slot="boot-failure"]')).toHaveCount(0);
  }

  const exported = await addPoiStopAndExport(page, SITE);
  await collectCsp(page, faults);
  expect(withoutDebugOverlayStyle(faults.cspViolations)).toEqual([]); // the debug overlay's blocked <style> is B-05
  expect(faults.pageErrors).toEqual([]);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${info.project.name}.json`), `${JSON.stringify(exported.exportNormalised)}\n`);

  // The last project of the matrix compares what the earlier ones wrote in this run.
  if (info.project.name === MATRIX[MATRIX.length - 1]) {
    const written = readdirSync(DIR).filter((f) => f.endsWith(".json") && MATRIX.includes(f.replace(/\.json$/, "")));
    expect(written.length, "the exports of the three projects").toBe(MATRIX.length);
    const texts = written.map((f) => readFileSync(join(DIR, f), "utf8"));
    for (const text of texts) expect(JSON.parse(text)).toEqual(JSON.parse(texts[0]!));
  }
});

// Observed on 13 Nov 2026 (phone-portrait-390x844): the site name and the data-version chip of the top bar lie over the "Layers · Plan" and
// "POI · Conditions" buttons and receive their pointer events, so a finger or a mouse cannot open either drawer (Playwright: "<span
// class=scr02-site-name> intercepts pointer events"). B-04 in docs/plan/backend/01-needs-from-frontend.md; SCR-02 is frontend package 07.
test.fixme("release-matrix: the Layers · Plan button is tappable on a 390 px phone (enabled by frontend package 07, B-04)", async ({ page }) => {
  await page.goto(`/?site=${SITE}#/planner`);
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.locator('[data-slot="drawer-toggle"][data-for="left"]').click(); // actionability: nothing may cover it
  await expect(page.locator('[data-drawer="left"]')).toBeVisible();
});
