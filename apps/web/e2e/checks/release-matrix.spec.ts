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
 *
 * The comparison runs in the last project of the run (`release-demo`), because Playwright does not order the projects and a device
 * could compare before the other two had written their export.
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
// The project that runs last; only it compares, so all three exports exist when it does.
const COMPARING_PROJECT = "release-demo";

test("release-matrix: the device's own scenario runs and its plan export is the same on every device", async ({ page }, info) => {
  test.setTimeout(150_000);
  // The comparing project only compares; the three devices export.
  test.skip(info.project.name === COMPARING_PROJECT, "the comparing project only compares the three device exports");
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
});

// The cross-device half. It runs in the last project of the run, so all three device exports exist when it compares them.
test("release-matrix: the three devices exported the same plan", async ({}, info) => {
  test.setTimeout(180_000);
  test.skip(info.project.name !== COMPARING_PROJECT, "only the last project of the run compares the three device exports");
  await expect
    .poll(() => readdirSync(DIR).filter((f) => f.endsWith(".json") && MATRIX.includes(f.replace(/\.json$/, ""))).length, {
      message: "the exports of the three matrix devices",
      timeout: 150_000,
    })
    .toBe(MATRIX.length);
  const parsed = MATRIX.map((name) => JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")));
  for (let i = 1; i < parsed.length; i += 1) {
    expect(parsed[i], `${MATRIX[i]} exports the same plan as ${MATRIX[0]}`).toEqual(parsed[0]);
    expect(parsed[i].plan_hash, `${MATRIX[i]} has the same plan hash as ${MATRIX[0]}`).toBe(parsed[0].plan_hash);
  }
});

// Observed on 13 Nov 2026 (phone-portrait-390x844): the site name and the data-version chip of the top bar lie over the "Layers · Plan" and
// "POI · Conditions" buttons and receive their pointer events, so a finger or a mouse cannot open either drawer (Playwright: "<span
// class=scr02-site-name> intercepts pointer events"). B-04 in docs/plan/backend/01-needs-from-frontend.md; SCR-02 is frontend package 07.
// Fixed 13 Nov 2026 (FD-425): the top bar wraps below 640 px, the site name and the data-version chip truncate, and the first-run coach
// marks move clear of an open one-drawer drawer instead of intercepting its clicks. The `planner-drawer` check covers the same drawer on
// five viewports.
// The one-drawer layout with its "Layers · Plan" toggle exists only below 768 px; the wider layout shows both drawers at once, so the
// toggle is absent there and this case is phone-only.
test("release-matrix: the Layers · Plan button is tappable on a 390 px phone (enabled by frontend package 07, B-04)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "the one-drawer layout with the Layers · Plan toggle exists only below 768 px");
  await page.goto(`/?site=${SITE}#/planner`);
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.locator('[data-slot="drawer-toggle"][data-for="left"]').click(); // actionability: nothing may cover it
  await expect(page.locator('[data-drawer="left"]')).toBeVisible();
});

// B-04 names both toggles. Nothing in the top bar may overlap either toggle's box, and the "POI · Conditions" toggle opens its drawer.
test("release-matrix: the top bar overlaps neither drawer toggle, and POI · Conditions is tappable on a phone (B-04)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "the one-drawer layout with its drawer toggles exists only below 768 px");
  await page.goto(`/?site=${SITE}#/planner`);
  await page.locator('[data-slot="map-workspace"]').waitFor();
  const boxes = async (selector: string) =>
    (await page.locator(selector).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) as DOMRect[];
  const toggles = await boxes('[data-slot="drawer-toggle"]');
  expect(toggles.length, "both drawer toggles are rendered").toBe(2);
  const bar = await boxes(".scr02-site-name, .scr02-chip");
  for (const t of toggles) {
    for (const b of bar) {
      const overlap = b.left < t.right && t.left < b.right && b.top < t.bottom && t.top < b.bottom;
      expect(overlap, `a top-bar item at (${b.left}, ${b.top}) overlaps a drawer toggle at (${t.left}, ${t.top})`).toBe(false);
    }
  }
  await page.locator('[data-slot="drawer-toggle"][data-for="right"]').click(); // actionability: nothing may cover it
  await expect(page.locator('[data-drawer="right"]')).toBeVisible();
});
