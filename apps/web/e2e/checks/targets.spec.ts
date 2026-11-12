/**
 * Check `targets` (replaces T24.11 targets; 04 §C.3, FD-153). Enabled by packages 17 (EVA), 19 (ops) and 07 (planner workspace; 09 adds the plan panel).
 * EVA and HUD: every target at least 56 x 56 px with gaps of at least 8 px. Ops: at least 32 px. Planner: at least 44 px under
 * `pointer: coarse`. The limits are 04 §C.3's; this file only applies them.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectGaps, expectTargetSize, targets } from "../lib/geometry";
import { openOpsFixture, openOpsPanel } from "../lib/opsFixture";
import { openEvaFixture } from "../lib/evaFixture";
import { waitForSnapshot } from "../lib/hab";
import { addStopByKeyboard, openPlanTab } from "../lib/planner";

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

async function checkOpsTargets(page: Page, scope = "body"): Promise<void> {
  const list = await targets(page, scope);
  expect(list.length, `visible ops targets in ${scope}`).toBeGreaterThan(0);
  expectTargetSize(list, OPS_MIN);
}

async function checkOpsPanels(page: Page, allowTask: boolean): Promise<void> {
  await openOpsPanel(page, "mission");
  await checkOpsTargets(page, 'aside[aria-label="Conditions and options"]');
  await openOpsPanel(page, "crew");
  await checkOpsTargets(page, 'aside[aria-label="Crew and vehicles"]');
  if (allowTask) {
    await page.getByRole("button", { name: "Add task for EV1" }).click();
    await expect(page.getByRole("dialog", { name: "Add stop task" })).toBeVisible();
    await checkOpsTargets(page, '[data-testid="add-task-popover"]');
    await page.getByRole("button", { name: "Close add task popover" }).click();
  }
  await page.locator('[data-slot="event-log-strip"]').click();
  await expect(page.getByRole("dialog", { name: "Event log", exact: true })).toBeVisible();
  await checkOpsTargets(page, '[data-slot="event-log-drawer"]');
}

test("targets: ops targets are at least 32 px (enabled by package 19)", async ({ context, page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "FD-210: ops controls require 1024px; the phone notice is checked separately");
  for (const state of ["loaded", "running", "paused", "alerting"] as const) {
    const opsPage = await context.newPage();
    try {
      await openOpsFixture(opsPage, state);
      await checkOpsTargets(opsPage);
      await checkOpsPanels(opsPage, state !== "alerting");
    } finally { await opsPage.close(); }
  }
});

test("targets: narrow ops opens every asserted panel at 1100px", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await openOpsFixture(page, "running");
  await checkOpsPanels(page, true);
  await page.getByRole("button", { name: "Close event log" }).click();
  await expect(page.locator('[data-slot="event-log-strip"]')).toBeFocused();
});

test("targets: phone ops displays the larger-screen notice", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1024, "FD-210 notice only below 1024px");
  await openOpsFixture(page, "loaded");
  await expect(page.getByRole("heading", { name: "Use a larger screen" })).toBeVisible();
  await expect(page.getByTestId("clock-control")).toHaveCount(0);
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
