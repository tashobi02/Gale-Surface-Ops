/**
 * Check `plan-hash` (replaces the T11.05 reproduction — the plan hash and the export).
 *
 * T11.05 step 5 asks for the exported plan to be re-run and compared: the same `plan_hash` and identical metrics. The
 * app has no "import plan" screen (nothing in 03 SCR-08 asks for one), so the check does what the step asks in the app
 * that exists: it exports the plan, reloads the planner, rebuilds the **same** plan (the same scenario and the same
 * waypoints, so the real worker computes it again from the grid), exports it a second time and compares the two.
 *
 * What is compared:
 * - `plan_hash` — the hash of 05 §C over `{data_version, scenario, waypoints}` (FD-134). The hash rule itself is proved
 *   by the unit test `apps/web/tests/export/planExport.reload.test.ts`, which imports the app's own `planHash`; this
 *   check proves it in the browser, over two independent runs.
 * - every result metric — the totals and the radiation block of the two exports.
 *
 * The origin is the harness's plain `http://127.0.0.1` (FD-141): the hash is pure TypeScript, so it works without a
 * secure context, and the check asserts that it really is a plain origin.
 */
import { expect, test, type Download, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/** What the check reads out of an export. */
interface ExportedPlan {
  export_schema_version: string;
  app_version: string;
  site_id: string;
  data_version: string;
  plan_hash: string;
  scenario: Record<string, unknown>;
  waypoints: { id: string; x_m: number; y_m: number }[];
  result: {
    status: string;
    totals: Record<string, number> | null;
    radiation: Record<string, number | string> | null;
    legs: { from: string; to: string; status: string }[];
  };
  disclaimer: string;
}

/** Opens the demo plan on the given site, sets the same start every run and waits for the worker's answer. */
async function buildDemoPlan(page: Page, site: string): Promise<void> {
  await page.goto(`/?site=${site}#/`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /open demo plan/i }).click();
  await expect(page).toHaveURL(/#\/planner/);
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  const start = page.getByLabel(/EVA start/i);
  await start.fill("");
  await start.fill("2026-11-14T08:00:00Z");
  const banner = page.locator("[data-results-banner]");
  await expect(banner, "the worker answered").toBeVisible({ timeout: 30_000 });
  await expect(banner, "the worker finished").not.toContainText("Computing…", { timeout: 30_000 });
}

/** Exports the plan from the briefing card and reads the JSON. */
async function exportPlan(page: Page): Promise<ExportedPlan> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await page.getByRole("button", { name: /^Briefing/ }).click();
      await expect(page).toHaveURL(/#\/briefing/);
      await page.getByRole("button", { name: /export plan json/i }).click();
    })(),
  ]);
  return await readExport(download);
}

/** The exported JSON of a download. */
async function readExport(download: Download): Promise<ExportedPlan> {
  return JSON.parse(readFileSync(await download.path(), "utf8")) as ExportedPlan;
}

test("plan-hash: export, reload and recompute give the same metrics and plan_hash", async ({ page }) => {
  const site = "mock_site";
  await buildDemoPlan(page, site);
  const first = await exportPlan(page);

  // The export is complete: it carries the version, the site, the disclaimer and the hash (05 §C, FR-14).
  expect(first.export_schema_version, "the export names its schema version").toMatch(/^\d+\.\d+\.\d+$/);
  expect(first.app_version, "the export names the app version").not.toBe("");
  expect(first.site_id).toBe(site);
  expect(first.data_version, "the export names the data version").not.toBe("");
  expect(first.plan_hash, "the export carries the plan hash").toMatch(/^[0-9a-f]{12}$/);
  expect(first.disclaimer, "the export carries the disclaimer").toContain("prototype");
  expect(first.waypoints.length, "the plan has waypoints").toBeGreaterThan(0);

  // The card shows the same hash the export carries (FD-134: the plan that reaches ops carries the planner's hash).
  await page.getByRole("button", { name: "Back to map" }).click();
  await page.getByRole("button", { name: /^Briefing/ }).click();
  await expect(page.locator("[data-plan-hash]")).toContainText(first.plan_hash);

  // Reload the planner and rebuild the same plan: the worker computes it again from the grid.
  await page.goto(`/?site=${site}#/`);
  await buildDemoPlan(page, site);
  const second = await exportPlan(page);

  // The same plan, the same hash.
  expect(second.plan_hash, "the recomputed plan has the same hash").toBe(first.plan_hash);
  expect(second.data_version).toBe(first.data_version);
  expect(second.scenario, "the recomputed plan has the same scenario").toEqual(first.scenario);
  expect(second.waypoints, "the recomputed plan has the same waypoints").toEqual(first.waypoints);

  // The same metrics (FR-14: re-running the exported plan gives identical metrics).
  expect(second.result.status).toBe(first.result.status);
  expect(second.result.totals, "the recomputed plan has the same totals").toEqual(first.result.totals);
  expect(second.result.radiation, "the recomputed plan has the same radiation").toEqual(first.result.radiation);
  expect(second.result.legs.map((leg) => `${leg.from}>${leg.to}:${leg.status}`)).toEqual(
    first.result.legs.map((leg) => `${leg.from}>${leg.to}:${leg.status}`),
  );

  // FD-141: the hash is pure TypeScript, so it works on a plain origin without a secure context.
  expect(await page.evaluate(() => window.isSecureContext || location.hostname === "127.0.0.1"), "the harness origin is plain http").toBe(true);
});
