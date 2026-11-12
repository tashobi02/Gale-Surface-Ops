/**
 * Check `targets` (replaces T24.11 targets; 04 §C.3, FD-153). Enabled by packages 17 (EVA), 19 (ops) and 07 (planner workspace; 09 adds the plan panel).
 * EVA and HUD: every target at least 56 x 56 px with gaps of at least 8 px. Ops: at least 32 px. Planner: at least 44 px under
 * `pointer: coarse`. The limits are 04 §C.3's; this file only applies them.
 */
import { expect, test } from "@playwright/test";
import { expectGaps, expectTargetSize, targets } from "../lib/geometry";
import { openOpsFixture } from "../lib/opsFixture";
import { openEvaFixture } from "../lib/evaFixture";
import { waitForSnapshot } from "../lib/hab";
import { addStopByKeyboard, openPlanTab } from "../lib/planner";
import { openSetupFixture } from "../lib/setupFixture";
import { openPresenterFixture, type PresenterFixtureState } from "../lib/presenterFixture";

const EVA_MIN = 56;
const EVA_GAP = 8;
const OPS_MIN = 32;
const PLANNER_COARSE_MIN = 44;

test("targets: EVA and HUD targets are at least 56 px with 8 px gaps (enabled by package 17)", async ({ page }) => {
  for (const hash of ["#/eva/EV1", "#/hud/EV1"]) {
    await page.goto(`/${hash}`);
    await waitForSnapshot(page);
    const list = await targets(page);
    expectTargetSize(list, EVA_MIN);
    expectGaps(list, EVA_GAP);
  }
});

test("targets: ops targets are at least 32 px (enabled by package 19)", async ({ context }) => {
  for (const state of ["loaded", "running", "paused", "alerting"] as const) {
    const page = await context.newPage();
    try {
      await openOpsFixture(page, state);
      expectTargetSize(await targets(page), OPS_MIN);
    } finally { await page.close(); }
  }
});

// Packages 23 and 24: the presenter panel and the mission setup are OPS screens, so the ops minimum applies (04 §C.3).
test("targets: presenter panel and mission setup targets are at least 32 px (packages 23, 24)", async ({ page }) => {
  for (const hash of ["#/presenter", "#/setup"]) {
    await page.goto(`/?site=mock_site${hash}`);
    await page.waitForLoadState("networkidle");
    await waitForSnapshot(page);
    expectTargetSize(await targets(page), OPS_MIN);
  }
  // The same, with two candidate cards and every setting enabled (lib/setupFixture.ts).
  const setup = await openSetupFixture(page, "ready");
  const list = await targets(page);
  expect(list.length, "candidate buttons and settings are targets").toBeGreaterThanOrEqual(7);
  expectTargetSize(list, OPS_MIN);
  setup.stop();
});

// Package 23: the presenter panel's own states (lib/presenterFixture.ts), including the open reset question.
test("targets: presenter panel targets are at least 32 px in every state (package 23)", async ({ page }) => {
  for (const state of ["pending", "reset-confirm", "rejected", "storm-running", "ended"] as PresenterFixtureState[]) {
    const fixture = await openPresenterFixture(page, state);
    const list = await targets(page);
    expect(list.length, `the panel has targets in ${state}`).toBeGreaterThan(0);
    expectTargetSize(list, OPS_MIN);
    fixture.answer();
    fixture.stop();
  }
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

test.fixme("needs N-29: cycle a skipped task reason during the undo window", async ({ page }) => {
  await openEvaFixture(page, "at-stop");
  await page.getByTestId("tasks-button").click();
  await page.getByRole("button", { name: /^Skip task:/ }).click();
  await page.getByRole("button", { name: /reason/i }).click();
  await expect(page.getByText(/reason: time/i)).toBeVisible();
});
