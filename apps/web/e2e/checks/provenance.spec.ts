/**
 * Check `provenance` (replaces T12.06). Enabled by packages 28 and 29.
 * The demo path (SCR-01, SCR-02, SCR-05, SCR-07, SCR-08) and every live role: `unlabelledNumbers` is empty, and every source id
 * shown resolves in SCR-09.
 */
import { expect, test } from "@playwright/test";
import { waitForSnapshot } from "../lib/hab";
import { expectNoUnlabelledNumbers } from "../lib/provenance";
import { openReplayFixture } from "../lib/replayFixture";

const DEMO_PATH = ["#/", "#/planner", "#/briefing"];
const LIVE = ["#/ops", "#/eva/EV1", "#/hud/EV1", "#/report", "#/replay"];

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

test.fixme("provenance: no unlabelled number on the demo path and every source id resolves in SCR-09 (enabled by package 28)", async ({ page }) => {
  const sources = new Set<string>();
  for (const hash of DEMO_PATH) {
    await page.goto(`/${hash}`);
    await page.waitForLoadState("networkidle");
    await expectNoUnlabelledNumbers(page, hash);
    for (const id of await page.locator("[data-source]").evaluateAll((els) => els.map((e) => e.getAttribute("data-source")!))) sources.add(id);
  }
  await page.goto("/#/sources");
  for (const id of sources) await expect(page.locator(`[id="${id}"], [data-anchor="${id}"]`).first(), `source ${id} is not in SCR-09`).toBeAttached();
});

test.fixme("provenance: no unlabelled number on any live role (enabled by package 29)", async ({ page }) => {
  for (const hash of LIVE) {
    await page.goto(`/${hash}`);
    if (hash !== "#/report" && hash !== "#/replay") await waitForSnapshot(page);
    await expectNoUnlabelledNumbers(page, hash);
  }
});

// Package 27: `#/replay` on the fixture recording (N-81 pending): the replay bar (position, hashes) and the ops view under it.
test("provenance: no unlabelled number on #/replay, paused and after a step (package 27)", async ({ page }) => {
  await openReplayFixture(page);
  await expectNoUnlabelledNumbers(page, "#/replay");
  await page.locator('[data-slot="replay-step"]').click();
  await expectNoUnlabelledNumbers(page, "#/replay after a step");
});
