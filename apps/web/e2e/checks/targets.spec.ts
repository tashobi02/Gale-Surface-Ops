/**
 * Check `targets` (replaces T24.11 targets; 04 §C.3, FD-153). Enabled by packages 17 (EVA), 19 (ops) and 09 (planner).
 * EVA and HUD: every target at least 56 x 56 px with gaps of at least 8 px. Ops: at least 32 px. Planner: at least 44 px under
 * `pointer: coarse`. The limits are 04 §C.3's; this file only applies them.
 */
import { test } from "@playwright/test";
import { expectGaps, expectTargetSize, targets } from "../lib/geometry";
import { waitForSnapshot } from "../lib/hab";

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

test.fixme("targets: planner targets are at least 44 px under a coarse pointer (enabled by package 09)", async ({ page }) => {
  await page.goto("/#/planner");
  await page.waitForLoadState("networkidle");
  expectTargetSize(await targets(page), PLANNER_COARSE_MIN);
});
