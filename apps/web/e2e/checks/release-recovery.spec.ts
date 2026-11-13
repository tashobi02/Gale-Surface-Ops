/**
 * Check `release-recovery` (backend package 28, T14.10; NFR-10, BD-83). Backend-owned.
 * On scratch copies of the F4 site (`data/sites/e2e_*`, removed afterwards): a missing manifest is named by SCR-00 and Retry boots once
 * the file is back, with the keyboard alone; a deleted optional layer is unavailable while routing still works; a corrupted grid file
 * is named by SCR-00 in the production build (BD-83). A worker failure and a dev-build corruption need hooks the app does not have:
 * they are `fixme` and name the frontend package.
 */
import { expect, test } from "@playwright/test";
import { readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addStopByKeyboard } from "../lib/planner";
import { REPO_ROOT, withScratchSite } from "../lib/release";

const MOCK = join(REPO_ROOT, "data", "sites", "mock_site");

test("release-recovery: SCR-00 names a missing manifest and Retry, reached by the keyboard alone, boots once it is back", async ({ page }) => {
  await withScratchSite("e2e_manifest_gone", (dir) => rmSync(join(dir, "site-manifest.json")), async (site, dir) => {
    await page.goto(`/?site=${site}#/planner`);
    const screen = page.locator('[data-screen="SCR-00"]');
    await expect(screen).toBeVisible();
    await expect(screen.locator('[data-slot="missing-file"]')).toHaveText(`sites/${site}/site-manifest.json`);
    // Put the manifest back, naming the scratch site as withScratchSite does.
    const manifest = JSON.parse(readFileSync(join(MOCK, "site-manifest.json"), "utf8")) as object;
    writeFileSync(join(dir, "site-manifest.json"), `${JSON.stringify({ ...manifest, site_id: site })}\n`);
    const retry = page.locator('[data-slot="boot-retry"]');
    for (let presses = 0; presses < 20 && !(await retry.evaluate((el) => el === document.activeElement)); presses += 1) await page.keyboard.press("Tab");
    await expect(retry, "Retry is reached by Tab").toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-screen="SCR-02"]').first()).toBeVisible();
    await expect(screen).toHaveCount(0);
  });
});

test("release-recovery: a deleted optional layer is unavailable and routing still works", async ({ page }) => {
  await withScratchSite("e2e_layer_gone", (dir) => rmSync(join(dir, "tiles", "elevation"), { recursive: true }), async (site) => {
    await page.goto(`/?site=${site}#/planner`);
    await page.waitForLoadState("networkidle");
    await page.locator('[data-slot="map-workspace"]').waitFor();
    await expect(page.locator('[data-slot="boot-failure"]')).toHaveCount(0);
    const toggle = page.locator('[data-slot="drawer-toggle"][data-for="left"]');
    if (await toggle.isVisible()) await toggle.click();
    // Turning the layer on makes the map ask for its tiles; the layer row then reports it as unavailable and the slope layer is untouched.
    const row = page.locator('[data-drawer="left"] [data-layer-id="elevation"]');
    await row.locator('[role="switch"]').click();
    await expect(row).toHaveAttribute("data-state", /unavailable|error|missing/i, { timeout: 10_000 });
    await expect(page.locator('[data-drawer="left"] [data-layer-id="slope"]')).not.toHaveAttribute("data-state", /unavailable|error|missing/i);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("tab", { name: "Plan" }).click();
    await page.getByLabel(/EVA start/i).fill("2026-11-14T08:00:00Z");
    await addStopByKeyboard(page, 1);
    await addStopByKeyboard(page, 2);
    await expect(page.locator("[data-results-banner]")).toBeVisible();
  });
});

test("release-recovery: a grid file of the wrong length is named by SCR-00 in the production build (BD-83)", async ({ page }) => {
  await withScratchSite("e2e_grid_short", (dir) => truncateSync(join(dir, "grid", "elevation.f32"), 100), async (site) => {
    await page.goto(`/?site=${site}#/planner`);
    const screen = page.locator('[data-screen="SCR-00"]');
    await expect(screen).toBeVisible({ timeout: 15_000 });
    await expect(screen).toContainText(/elevation/i);
    await expect(page.locator('[data-slot="boot-retry"]')).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-mode", "ops");
  });
});

// The app now has the failure state and the Retry (frontend package 09, T09.07): the results panel's banner reads "Computation failed"
// and offers a Retry. The `results-states` check proves it on the route-results screen. This case stays a placeholder because the
// trigger differs: it wants a `__failWorker` hook on the page, and the app exposes no such hook (the failure is driven by the plan
// store's own error state). Adding a debug-only failure hook to the app would be a test hook in production code, so the acceptance
// stays with `results-states` until the backend/worker provides a way to fail a live computation on demand (N-211).
test.fixme("needs N-211: a worker failure shows Computation failed with Retry without a frontend debug hook (T09.07 UI verified in results-states)", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await page.evaluate(() => (window as unknown as { __failWorker?: () => void }).__failWorker?.());
  await expect(page.getByRole("alert").filter({ hasText: /Computation failed/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Retry$/ })).toBeVisible();
});

test.skip("not applicable to production e2e: corrupted-grid checksum is dev-build only (BD-83, 02 §E.1)", async () => {
  // Production does not hash the grid (02 §E.1); the dev build would. `make e2e` serves only the production build.
});
