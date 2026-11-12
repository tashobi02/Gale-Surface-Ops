/**
 * Check `targets` (replaces T24.11 targets; 04 §C.3, FD-153). Enabled by packages 17 (EVA), 19 (ops) and 07 (planner workspace; 09 adds the plan panel).
 * EVA and HUD: every target at least 56 x 56 px with gaps of at least 8 px. Ops: at least 32 px. Planner: at least 44 px under
 * `pointer: coarse`. The limits are 04 §C.3's; this file only applies them.
 */
import { expect, test } from "@playwright/test";
import { expectGaps, expectTargetSize, targets } from "../lib/geometry";
import { waitForSnapshot } from "../lib/hab";
import { addStopByKeyboard, openPlanTab } from "../lib/planner";

const EVA_MIN = 56;
const EVA_GAP = 8;
const OPS_MIN = 32;
const PLANNER_COARSE_MIN = 44;

test.fixme("targets: EVA and HUD targets are at least 56 px with 8 px gaps (enabled by package 17)", async ({ page }) => {
  for (const hash of ["#/eva/EV1", "#/hud/EV1"]) {
    await page.goto(`/${hash}`);
    await waitForSnapshot(page);
    const list = await targets(page);
    expectTargetSize(list, EVA_MIN);
    expectGaps(list, EVA_GAP);
  }
});

test.fixme("targets: ops targets are at least 32 px (enabled by package 19)", async ({ page }) => {
  await page.goto("/#/ops");
  await waitForSnapshot(page);
  expectTargetSize(await targets(page), OPS_MIN);
});

// Package 07 enables the planner workspace on the touch projects; package 09 adds the plan panel's targets to the same page.
test("targets: planner workspace targets are at least 44 px under a coarse pointer (package 07)", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "a coarse pointer needs a touch project");
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  expectTargetSize(await targets(page), PLANNER_COARSE_MIN);
});

// Package 09: the plan panel's inputs, switches, radios and stops-list buttons, on the same touch projects.
test("targets: plan panel targets are at least 44 px under a coarse pointer (package 09)", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "a coarse pointer needs a touch project");
  await openPlanTab(page);
  const list = await targets(page, '[data-slot="plan-panel"]');
  expect(list.length, "the plan panel has targets").toBeGreaterThan(0);
  expectTargetSize(list, PLANNER_COARSE_MIN);
});

// Package 10: the add-stop button and the keyboard-move buttons while a stop is selected, on the same touch projects.
test("targets: add-stop and keyboard-move targets are at least 44 px under a coarse pointer (package 10)", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "a coarse pointer needs a touch project");
  await openPlanTab(page);
  await addStopByKeyboard(page, 1);
  await page.getByRole("group", { name: "Move stop 1" }).waitFor();
  const list = await targets(page, '[data-slot="map-toolbar"]');
  expect(list.some((t) => /Add stop/.test(t.label))).toBe(true);
  expect(list.some((t) => /one cell east/.test(t.label))).toBe(true);
  expectTargetSize(list, PLANNER_COARSE_MIN);
});
