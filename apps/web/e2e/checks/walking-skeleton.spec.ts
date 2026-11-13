/**
 * Check `walking-skeleton` (replaces T09.06 — the M3 walking-skeleton go/no-go for ADR-004).
 *
 * The check runs the demo plan (SCR-01 "Open demo plan") on the **real** plan worker — not the F3 mock — and reads what
 * the worker computed: every leg routed, an elevation profile with the worker's own slope classes, and the worker's own
 * `timing_ms` (BD-50). The time is compared with the NFR-02 budget of 02 §F (the full-grid haven field ≤ 2 s); the
 * budget is read from the spec file at run time, so the check cannot drift from it.
 *
 * The outcome of the run is the evidence ADR-004 records (T09.06): the check writes the plan hash, the leg statuses, the
 * totals and the timings into `apps/web/e2e/out/walking-skeleton.json`, and the verification log names that file.
 *
 * The site is the one the harness is configured for (`E2E_SITE`, default the F4 `mock_site`). The real site
 * (`gale_boxwork`) and its scenario are N-20: without them the run reports what it could and what it could not.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { e2eSite } from "../lib/siteBundle";

/** The harness's own output folder; the ADR evidence is written here. */
const OUT_DIR = join(import.meta.dirname, "..", "out");

/**
 * The NFR-02 budget of 02 §F, read from the spec so the check does not carry a number of its own.
 *
 * 02 §F names the full-grid haven field: "≤ 2 s". When the row is not found, or does not name the budget, the check
 * fails rather than falling back to a number it invented.
 */
function readNfr02BudgetMs(): number {
  const path = join(import.meta.dirname, "..", "..", "..", "..", "docs", "specs", "02_Technical_Requirements_Document.md");
  const row = readFileSync(path, "utf8")
    .split("\n")
    .find((line) => line.startsWith("| NFR-02 |"));
  if (!row) throw new Error("02 §F has no NFR-02 row");
  const match = /full-grid haven field\s*≤\s*([\d.]+)\s*s/.exec(row);
  if (!match) throw new Error(`02 §F's NFR-02 row does not name the haven-field budget: ${row}`);
  return Number(match[1]) * 1000;
}

/** What the worker computed, as the check records it for ADR-004. */
interface SkeletonOutcome {
  site: string;
  plan_hash: string | null;
  status: string;
  legs: { from: string; to: string; status: string }[];
  totals: Record<string, number> | null;
  warnings: { code: string; severity: string; message: string }[];
  timing_ms: Record<string, number> | null;
  budget_ms: number;
  within_budget: boolean;
}

test("walking-skeleton: the demo plan routes every leg on the real worker within the NFR-02 budget", async ({ page }) => {
  const budgetMs = readNfr02BudgetMs();
  const site = e2eSite();

  await page.goto(`/?site=${site}#/`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /open demo plan/i }).click();
  await expect(page).toHaveURL(/#\/planner/);

  // The demo plan names no start time (FD-042); the worker needs one, so the check sets the same start every run. The
  // planner opens on the Layers tab; the Plan tab holds the inputs.
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  const start = page.getByLabel(/EVA start/i);
  await start.fill("");
  await start.fill("2026-11-14T08:00:00Z");

  // The worker answers: the banner leaves its Computing state.
  const banner = page.locator("[data-results-banner]");
  await expect(banner, "the worker answered").toBeVisible({ timeout: 30_000 });
  await expect(banner, "the worker finished").not.toContainText("Computing…", { timeout: 30_000 });

  // 06 §B M3 exit criteria: an elevation profile appears, drawn from the worker's own samples.
  const profile = page.locator("[data-profile]");
  await expect(profile, "the elevation profile is drawn").toBeVisible();
  const slopeClasses = await profile.locator("[data-slope-class]").evaluateAll((els) => els.map((el) => el.getAttribute("data-slope-class")));
  expect(slopeClasses.length, "the profile carries the worker's slope classes").toBeGreaterThan(0);
  for (const cls of slopeClasses) expect(cls, "a slope class is one of the known ones").toMatch(/ok|caution|over_limit|unknown/);
  await expect(profile.locator("[data-profile-sample]").first(), "the profile has samples").toHaveAttribute("data-distance-m", /.+/);

  // Every leg is routed (03 §D: an unroutable leg is a NO ROUTE, not a missing leg).
  const details = page.getByRole("button", { name: "Details", exact: true });
  if (await details.isVisible().catch(() => false)) await details.click();
  const table = page.getByRole("group", { name: "Leg details" });
  await expect(table, "the leg table is shown").toBeVisible();
  const legRows = await table.locator("tbody tr").evaluateAll((rows) =>
    rows.map((row) => {
      const cells = row.querySelectorAll("td");
      // The status cell carries the status glyph beside the word (04 §A.3 #2), so the word is read on its own.
      const word = cells[2]?.querySelector(".status-label")?.textContent?.trim() ?? "";
      return { leg: cells[0]?.textContent?.trim() ?? "", status: word };
    }),
  );
  expect(legRows.length, "the plan has legs").toBeGreaterThan(0);
  for (const leg of legRows) expect(leg.status, `leg ${leg.leg} is routed`).toBe("OK");

  // The export carries the worker's own timings (BD-50) and the plan hash (FD-134).
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await page.getByRole("button", { name: /^Briefing/ }).click();
      await expect(page).toHaveURL(/#\/briefing/);
      await page.getByRole("button", { name: /export plan json/i }).click();
    })(),
  ]);
  const exported = JSON.parse(readFileSync((await download.path())!, "utf8")) as {
    plan_hash: string;
    result: {
      status: string;
      legs: { from: string; to: string; status: string }[];
      totals: Record<string, number> | null;
      timing_ms: Record<string, number>;
      warnings: { code: string; severity: string; message: string }[];
    };
  };

  const outcome: SkeletonOutcome = {
    site,
    plan_hash: exported.plan_hash,
    status: exported.result.status,
    legs: exported.result.legs.map((leg) => ({ from: leg.from, to: leg.to, status: leg.status })),
    totals: exported.result.totals,
    warnings: exported.result.warnings.map((w) => ({ code: w.code, severity: w.severity, message: w.message })),
    timing_ms: exported.result.timing_ms,
    budget_ms: budgetMs,
    within_budget: exported.result.timing_ms.total <= budgetMs,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "walking-skeleton.json"), `${JSON.stringify(outcome, null, 2)}\n`);
  test.info().annotations.push({ type: "walking-skeleton", description: JSON.stringify(outcome) });

  // NFR-02: the haven field of the whole grid is computed within the budget.
  expect(outcome.timing_ms?.total ?? Number.POSITIVE_INFINITY, "the worker's total time").toBeLessThanOrEqual(budgetMs);
  // The worker routed every leg of the demo plan.
  expect(outcome.legs.every((leg) => leg.status === "OK"), "every leg of the demo plan is routed").toBe(true);
  // The result is one of the three routed states of 03 §D: the worker answered with a plan, not with a failure.
  expect(["OK", "PARTIAL", "OVER_LIMITS"]).toContain(outcome.status);
});
