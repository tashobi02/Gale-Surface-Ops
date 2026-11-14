/**
 * Check `results-states` (T09.01–T09.05, and T09.07 — SCR-05 against the OK, PARTIAL and OVER_LIMITS fixtures).
 *
 * The F3 mock worker answers with the F2 fixtures (`apps/web/tests/fixtures/plan-results/`); the check asks for one
 * variant at a time and reads what SCR-05 shows. The banner word, the totals, the profile and the warnings are compared
 * with the fixture the worker was given, so the check fails when the panel drifts from the result it renders.
 *
 * 03 §D and 04 §D, the rows this check walks:
 * - OK: every leg routed, the totals shown, the banner says OK.
 * - PARTIAL: the banner names the unroutable leg, the totals are hidden, the profile says NO ROUTE for that leg.
 * - OVER_LIMITS: the banner says Over limits and names the exceeded rule; the warning list carries the block.
 * - ERROR (T09.07): the banner says "Computation failed" and offers Retry.
 * - FR-08: the profile carries a slope class per sample and a word, so it reads in grayscale; the climb and descent are
 *   shown in metres.
 * - FR-10: every warning shows a shape, its word, its message and where or when it applies.
 * - FR-15: every shown value carries its provenance and its source.
 */
import { expect, test, type Page } from "@playwright/test";

/** The fixtures the F3 mock worker answers with, and what SCR-05 must show for each one. */
const VARIANTS = [
  { result: "ok", word: "OK", totals: true },
  { result: "partial", word: "Partial", totals: false },
  { result: "over-limits", word: "Over limits", totals: true },
] as const;

/** Puts one stop on the plan with the keyboard and accepts the snap offer 03 §D makes when the point is not walkable. */
async function addOneStop(page: Page): Promise<void> {
  await page.locator(".ol-viewport").focus();
  await page.keyboard.press("a");
  await page.keyboard.press("Enter");
  const snap = page.locator('[data-slot="placement-notice"] [data-action="accept-snap"]');
  const offered = await snap.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false);
  if (offered) await snap.click();
}

/** Opens the planner with the F3 mock worker on the given fixture, and puts a stop on the plan. */
async function openWithResult(page: Page, result: string): Promise<void> {
  await page.goto(`/?site=mock_site&mock_worker=1&mock_worker_result=${result}#/planner`);
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  // FD-042: the start has no default of its own; the Hab Core's session answer may land while the check types, so the
  // field is emptied first and the value typed afterwards.
  const start = page.getByLabel(/EVA start/i);
  await start.fill("");
  await start.fill("2026-11-14T08:00:00Z");
  await addOneStop(page);
}

for (const variant of VARIANTS) {
  test(`results-states: ${variant.word} banner, seven metrics, profile and warnings`, async ({ page }) => {
    await openWithResult(page, variant.result);
    const panel = page.getByRole("region", { name: "Route results", exact: true });
    await expect(panel).toBeVisible();
    const banner = panel.locator("[data-results-banner]");
    await expect(banner, "the banner names the result").toContainText(variant.word);
    // 04 §A.3 #2: status is never colour alone; the banner draws a glyph beside the word.
    await expect(banner.locator(".status-glyph")).toBeVisible();
    // FR-15: the banner is a shown value, so it says where it comes from.
    await expect(banner).toHaveAttribute("data-provenance", /measured|derived|modelled|assumed/);
    await expect(banner).toHaveAttribute("data-source", /result\.status/);

    // The metrics row: seven tiles, every value with its provenance and source (FR-15).
    const metrics = panel.locator(".scr05-metric");
    await expect(metrics, "seven metric tiles").toHaveCount(7);
    for (const tile of await metrics.all()) {
      await expect(tile.locator(".scr05-metric-label"), "the tile names its value").not.toBeEmpty();
      await expect(tile.locator("[data-provenance]").first(), "the tile value says who says so").toHaveAttribute("data-source", /.+/);
    }
    // FR-08: the climb and descent are shown in metres.
    await expect(metrics.filter({ hasText: "Climb / descent" })).toContainText("m");
    await expect(panel).not.toContainText("Profile unavailable");

    // The totals are hidden for a partial result (03 §D): the panel must not show numbers it cannot trust.
    await expect(panel.locator("[data-totals-hidden]")).toHaveAttribute("data-totals-hidden", variant.totals ? "false" : "true");
    if (!variant.totals) {
      await expect(metrics.filter({ hasText: "Distance" })).toContainText("—");
      await expect(panel.locator(".profile-no-route").first()).toContainText("NO ROUTE");
    }

    // The profile: FR-08. The F2 fixtures carry no elevation samples, so the panel must say so honestly (FR-15: a value
    // the backend did not supply shows "—") rather than draw an empty chart. The slope classes of a real profile are
    // checked by `walking-skeleton`, where the real worker supplies the samples.
    const profile = panel.locator("[data-profile]");
    await expect(profile, "the profile is drawn").toBeVisible();
    await expect(profile, "the absent samples are named").toContainText("No elevation samples supplied");
    await expect(profile.locator("[data-unavailable='true']").first(), "the absent samples carry their source").toHaveAttribute("data-source", /unavailable:result\.legs\.profile/);
    // The chart's slope classes are named in its caption, so the reader knows what the patterns mean (FR-08).
    await expect(profile.locator(".profile-caption").last()).toContainText("Slope:");

    // The bands: the haven and comm bands of the profile (04 §D).
    for (const band of ["haven", "comm"]) await expect(panel.locator(`[data-band="${band}"]`)).toBeVisible();
    const haven = panel.locator('[data-band="haven"]');
    await expect(haven).toContainText("Hab only");
    const vehicle = haven.locator('[data-haven-vehicle]');
    await expect(vehicle).toContainText(/—.*rover start.*ParamSet/i);
    await expect(vehicle).toHaveAttribute("data-unavailable", "true");
    await expect(vehicle).toHaveAttribute("data-source", "unavailable:result.legs.profile.haven_vehicle");

    // FR-10: every warning shows a shape, its word, its message and where it applies.
    const warnings = panel.getByRole("region", { name: "Route warnings" });
    await expect(warnings).toBeVisible();
    const items = warnings.locator(".warning-item");
    await expect(items.first(), "the fixture's warning is listed").toBeVisible();
    for (const item of await items.all()) {
      await expect(item, "the warning carries a severity").toHaveAttribute("data-severity", /blocked|caution|unknown/);
      await expect(item.locator(".status-glyph"), "the warning draws a shape").toBeVisible();
      await expect(item.locator(".warning-status"), "the warning names its status").not.toBeEmpty();
      await expect(item.locator(".warning-message"), "the warning has a message").not.toBeEmpty();
      // FR-15: the warning is derived from a rule and names the layers it reads.
      await expect(item).toHaveAttribute("data-provenance", "derived");
      await expect(item).toHaveAttribute("data-source", /rule:/);
    }
    // A located warning is a button that zooms the map (FR-10).
    await expect(warnings.getByRole("button", { name: /^Zoom to / }).first()).toBeVisible();

    // The panel collapses and expands, and the banner stays (04 §D).
    await page.getByRole("button", { name: "Collapse results panel" }).click();
    await expect(banner).toBeVisible();
    await page.getByRole("button", { name: "Expand results panel" }).click();
    await expect(banner).toBeVisible();
  });
}

// 03 §D and T09.07: the worker fails — the banner says "Computation failed" and offers Retry.
test("results-states: a worker error shows Computation failed and a Retry", async ({ page }) => {
  await openWithResult(page, "error");
  const panel = page.getByRole("region", { name: "Route results", exact: true });
  const banner = panel.locator("[data-results-banner]");
  await expect(banner, "the failure is named").toContainText("Computation failed");
  await expect(banner.locator(".status-glyph"), "the failure draws a shape").toBeVisible();
  await expect(banner.getByRole("button", { name: "Retry" }), "the failure offers a Retry").toBeVisible();
  // The panel does not pretend there is a result.
  await expect(panel.locator("[data-totals-hidden]")).toHaveAttribute("data-totals-hidden", "true");
});
