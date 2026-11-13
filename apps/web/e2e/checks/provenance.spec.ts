/**
 * Check `provenance` (replaces T12.06 — no unlabelled metric on the demo path and every credited source in SCR-09).
 *
 * Two rules are checked on the 01 §E demo path (SCR-01, SCR-02, SCR-04, SCR-05, SCR-07, SCR-08):
 *
 * 1. **No unlabelled number.** Every number on screen sits inside an element that carries both `data-provenance` and
 *    `data-source`, or is on the FD-110 allowlist (an identifier, the scale line, the debug overlay, an equation block).
 *    `unlabelledNumbers` is the same walk the DOM test of T12.02 uses.
 *
 * 2. **Every credited source resolves in SCR-09.** A `data-source` may be a path into the app's own state (`scenario.*`,
 *    `result.*`, `plan-export:*`, `manifest:*`, `user:*`, `unavailable:*`, `rule:*`, `proj:*`, `pois:*`), or the id of a
 *    dataset. A dataset id is one the bundle manifest names (`source_id`); such an id must be listed in SCR-09's dataset
 *    table with all six columns, and the chip that links to it (`#/sources#source-<id>`, FD-144) must land on an anchor
 *    that exists (T12.06 step 4).
 *
 * The F4 bundle names three datasets; the walk-time ids `tobler-1993` and `apollo17-planning` belong to the real bundle
 * (N-20), so on the F4 site they are checked as "a dataset id of the real bundle that the F4 manifest does not carry",
 * which is recorded in the verification log rather than silently passed.
 */
import { openBriefing, BRIEFING_STATES } from "../lib/briefing";
import { expect, test } from "@playwright/test";
import { waitForSnapshot } from "../lib/hab";
import { expectNoUnlabelledNumbers, PROVENANCE_ALLOWLIST, unlabelledNumbers } from "../lib/provenance";
import { openPoiTasks } from "../lib/plannerTasks";
import { openReplayFixture } from "../lib/replayFixture";
import { fetchManifest } from "../lib/siteGrid";
import { openOpsFixture } from "../lib/opsFixture";

test("provenance: ops join drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await openOpsFixture(page, "running");
  await page.getByRole("button", { name: "Join QR codes" }).click();
  await expectNoUnlabelledNumbers(page, "ops join drawer", '[role="group"][aria-label="Join QR codes"]');
});

const DEMO_PATH = ["#/", "#/planner", "#/briefing"];
const LIVE = ["#/ops", "#/eva/EV1", "#/hud/EV1", "#/report", "#/replay"];

/** The dataset ids the app hard-codes; they belong to the real bundle (N-20), not to the F4 fixture. */
const REAL_BUNDLE_DATASET_IDS = ["tobler-1993", "apollo17-planning"];

/**
 * Splits a `data-source` into its tokens.
 *
 * A source may name more than one dataset (`"tobler-1993 apollo17-planning"`), separated by spaces (FD-136). A path
 * (`result.totals.distance_m`) and a prefixed path (`unavailable:result.radiation.dose_mSv`) are one token each.
 */
function sourceTokens(source: string): string[] {
  return source.trim().split(/\s+/).filter((token) => token.length > 0);
}

/**
 * The dataset ids among the tokens of a source: the ones the bundle manifest names, plus the ids the app hard-codes
 * from the real bundle. Everything else is a path into the app's own state and is resolved by the app, not by SCR-09.
 */
function datasetTokens(source: string, manifestIds: readonly string[]): string[] {
  return sourceTokens(source).filter((token) => manifestIds.includes(token) || REAL_BUNDLE_DATASET_IDS.includes(token));
}

// Package 07: the planner workspace alone, on the F4 site. The demo-path test below stays `fixme` until SCR-01 and SCR-08 exist.
test("provenance: no unlabelled number on the planner workspace and every source id it shows is a known kind (package 07)", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await expectNoUnlabelledNumbers(page, "#/planner");
  const ids = await page.locator("[data-source]").evaluateAll((els) => els.map((e) => e.getAttribute("data-source")!));
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(id, "an empty source id").not.toBe("");
});

// Package 09: the Plan tab (inputs, LTST preview, an inline range error, stops list) shows no unlabelled number.
test("provenance: no unlabelled number in the plan panel, with an inline range error showing (package 09)", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.getByRole("tab", { name: "Plan" }).click();
  await page.locator('[data-slot="plan-panel"]').waitFor();
  await page.getByLabel(/walkback limit/i).fill("99");
  await expect(page.getByRole("alert").filter({ hasText: /walkback/i })).toBeVisible();
  await expectNoUnlabelledNumbers(page, "#/planner Plan tab");
});

test("provenance: task text, kinds, counts and inline limits carry their source in SCR-04 (package 25)", async ({ page }) => {
  const { editor, suggested } = await openPoiTasks(page);
  for (const input of await editor.locator("[data-task-text], select").all()) {
    await expect(input).toHaveAttribute("data-provenance", "assumed");
    await expect(input).toHaveAttribute("data-source", /.+/);
  }
  const first = editor.locator("[data-task-text]").first();
  await expect(first).toHaveAttribute("data-source", suggested[0]!.source_id ?? `scenario.task_library:${suggested[0]!.library_task_id}`);
  await first.fill("Observe the ridge");
  await expect(first).toHaveAttribute("data-source", /^user:stop_task\./);
  await first.fill("");
  await expect(editor.getByRole("alert")).toBeVisible();
  await expectNoUnlabelledNumbers(page, "SCR-04 task editor and error", "[data-stop-task-editor]");
});

test("provenance: the keyboard-move title ordinal is an identifier and the live announcement's count is labelled (package 25 review; FD-323)", async ({ page }) => {
  await openPoiTasks(page);
  await page.locator(".scr02-keyboard-move-title").waitFor();
  await expect(page.locator(".scr05-sr-only")).toContainText(/Plan updated: .*warning/);
  await expectNoUnlabelledNumbers(page, "SCR-02 keyboard-move title", ".scr02-keyboard-move-title");
  await expectNoUnlabelledNumbers(page, "SCR-05 live announcement", ".scr05-sr-only");
});

test("provenance: no unlabelled number on the demo path and every credited source resolves in SCR-09", async ({ page, request }) => {
  test.setTimeout(120_000);
  const manifest = await fetchManifest(request, "mock_site");
  const manifestIds = (manifest.sources ?? []).map((source) => source.source_id);
  expect(manifestIds.length, "the F4 bundle names its datasets").toBeGreaterThan(0);

  const sources = new Set<string>();
  for (const hash of DEMO_PATH) {
    if (hash === "#/planner") {
      // The planner is reached the way 01 §E reaches it: from the mission briefing, with the demo plan loaded and
      // computed, so SCR-02, SCR-04, SCR-05 and SCR-07 all carry values.
      await page.goto("/?site=mock_site#/");
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: /open demo plan/i }).click();
      await page.getByRole("tab", { name: "Plan", exact: true }).click();
      const start = page.getByLabel(/EVA start/i);
      await start.fill("");
      await start.fill("2026-11-14T08:00:00Z");
      await expect(page.locator("[data-results-banner]")).not.toContainText("Computing…", { timeout: 30_000 });
      await expectNoUnlabelledNumbers(page, hash);
    } else {
      await page.goto(`/?site=mock_site${hash}`);
      await page.waitForLoadState("networkidle");
      if (hash === "#/briefing") await page.locator('[data-slot="briefing-card"]').waitFor();
      await expectNoUnlabelledNumbers(page, hash);
    }
    for (const id of await page.locator("[data-source]").evaluateAll((els) => els.map((e) => e.getAttribute("data-source")!))) sources.add(id);
  }

  // SCR-09: every dataset of the bundle manifest is listed with all six columns, and every dataset id the demo path
  // shows has an anchor.
  await page.goto("/?site=mock_site#/sources");
  await page.locator('[data-screen="SCR-09"]').first().waitFor();
  for (const id of manifestIds) {
    const row = page.locator(`[data-slot="dataset-row"][data-source-id="${id}"]`);
    await expect(row, `the dataset ${id} is listed in SCR-09`).toBeVisible();
    // The six columns of the dataset table (T12.06 step 4): name, version, mission / instrument, resolution, licence,
    // link. The name column shows the dataset's title and carries its id as the source; a column with no value is
    // shown as the honest dash, so it is present but may be empty.
    const name = row.locator('[data-slot="dataset-name"]');
    await expect(name, `the dataset name of ${id}`).not.toHaveText("");
    await expect(name, `the dataset name of ${id} names its source`).toHaveAttribute("data-source", id);
    for (const column of ["dataset-version", "dataset-mission", "dataset-resolution", "dataset-licence", "dataset-link"]) {
      await expect(row.locator(`[data-slot="${column}"]`), `the ${column} column of ${id}`).toBeAttached();
    }
    await expect(page.locator(`[data-anchor-id="source-${id}"]`), `the anchor of ${id}`).toHaveCount(1);
  }

  // Every dataset id the demo path shows resolves: it is listed in SCR-09, and its chip lands on that anchor.
  const shownDatasets = new Set<string>();
  for (const source of sources) for (const token of datasetTokens(source, manifestIds)) shownDatasets.add(token);
  expect(shownDatasets.size, "the demo path shows at least one dataset id").toBeGreaterThan(0);
  for (const id of shownDatasets) {
    if (!manifestIds.includes(id)) {
      // A dataset of the real bundle that the F4 fixture does not carry (N-20). It is recorded, not passed silently.
      test.info().annotations.push({ type: "provenance", description: `dataset ${id} is not in the F4 manifest (N-20)` });
      continue;
    }
    await expect(page.locator(`[data-anchor-id="source-${id}"]`), `the anchor of the shown dataset ${id}`).toHaveCount(1);
  }

  // The chips of SCR-08 link to the anchors of SCR-09 (FD-144); each link lands on an anchor that exists.
  await page.goto("/?site=mock_site#/briefing");
  await page.locator('[data-slot="briefing-card"]').waitFor();
  const chips = await page.locator('a[href^="#/sources#source-"]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!));
  expect(chips.length, "the briefing card links its sources").toBeGreaterThan(0);
  for (const href of chips) {
    const anchor = href.slice("#/sources#".length);
    await page.goto(`/?site=mock_site${href}`);
    await page.locator('[data-screen="SCR-09"]').first().waitFor();
    await expect(page.locator(`[data-anchor-id="${anchor}"]`), `the anchor ${anchor} of the chip`).toHaveCount(1);
    // The deep link marks the entry it landed on, so the chip really did reach that anchor and not another one.
    await expect(page.locator(`[data-anchor-id="${anchor}"][data-anchor-target="true"]`), `the chip ${href} lands on its anchor`).toHaveCount(1);
  }
});

test.fixme("provenance: no unlabelled number on any live role (enabled by package 29)", async ({ page }) => {
  for (const hash of LIVE) {
    await page.goto(`/${hash}`);
    if (hash !== "#/report" && hash !== "#/replay") await waitForSnapshot(page);
    await expectNoUnlabelledNumbers(page, hash);
  }
});

// Package 27: `#/replay` on the fixture recording (N-81 pending): the replay bar (position, hashes). The ops console under it is
// the live ops view, covered by the live-role check above (fixme until package 29), so it is left out here.
test("provenance: no unlabelled number in the #/replay bar, paused and after a step (package 27)", async ({ page }) => {
  await openReplayFixture(page);
  const allow = [...PROVENANCE_ALLOWLIST, ".scr11-ops-console"];
  expect(await unlabelledNumbers(page, allow), "#/replay").toEqual([]);
  await page.locator('[data-slot="replay-step"]').click();
  expect(await unlabelledNumbers(page, allow), "#/replay after a step").toEqual([]);
});

test("provenance: SCR-08 briefing states have no unlabelled number (package 14)", async ({ page }) => {
  test.setTimeout(120_000);
  for (const state of BRIEFING_STATES) {
    await openBriefing(page, state);
    await expectNoUnlabelledNumbers(page, `#/briefing ${state}`);
  }
});
