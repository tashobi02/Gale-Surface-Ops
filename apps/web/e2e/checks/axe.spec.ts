/**
 * Check `axe` (replaces T13.09). Enabled by package 03 (shell) and by each screen package for its route.
 * axe-core in real Chromium, tags wcag2a, wcag2aa, wcag21aa: zero serious or critical violations on every built route, in its
 * mode, and on each EVA and ops state fixture (FD-151). The full result of each scan goes to `out/axe-<route>.json`.
 */
import { expect, test } from "@playwright/test";
import { axeScan, type HtmlMode } from "../lib/a11y";
import { waitForSnapshot } from "../lib/hab";
import { addStopByKeyboard, openPlanTab } from "../lib/planner";
import { openEvaFixture, type EvaFixtureState } from "../lib/evaFixture";
import { openOpsFixture } from "../lib/opsFixture";
import { withManifestlessSite } from "../lib/siteBundle";
import { REJECTION, openSetupFixture } from "../lib/setupFixture";
import { openPresenterFixture, type PresenterFixtureState } from "../lib/presenterFixture";

const LIVE = /^#\/(ops|eva|hud|presenter|setup)/;

// Routes that render real content today. Each screen package adds its own route here when it builds the screen, until the
// list equals `routeHashes()` (package 99 asserts that).
const BUILT_ROUTES = ["#/join", "#/ops", "#/hud/EV1", "#/eva/EV1", "#/report", "#/presenter", "#/setup"];

test("axe: every built route has no serious or critical violation", async ({ page }, testInfo) => {
  for (const hash of BUILT_ROUTES) {
    await page.goto(`${hash === "#/setup" || hash === "#/presenter" ? "/?site=mock_site" : "/"}${hash}`);
    await page.waitForLoadState("networkidle");
    if (hash === "#/presenter") await expect(page.locator('[data-screen="SCR-19"]')).toBeVisible();
    if (hash === "#/setup") {
      await expect(page.locator('[data-screen="SCR-20"]')).toBeVisible();
      await expect(page.locator('.setup-state')).toHaveText(/^(Ready|Locked)/);
      await expect(page.getByRole("heading", { name: "Mission settings", exact: true })).toBeVisible();
    }
    // Below 1024 px the ops console is its "Use a larger screen" notice (package 19), which holds no snapshot value to wait for.
    if (LIVE.test(hash) && (await page.getByRole("heading", { name: "Use a larger screen" }).count()) === 0) await waitForSnapshot(page);
    const mode = (await page.evaluate(() => document.documentElement.dataset.mode)) as HtmlMode;
    await axeScan(page, { mode, route: `${testInfo.project.name}-${hash}` });
  }
});

// Package 23: SCR-19 in each state of 03, from lib/presenterFixture.ts (the committed `live-loaded` snapshot over a stubbed
// socket, because the harness's own session is already running and would only ever show the running state).
test("axe: SCR-19 Advancing, Reset confirm, Command rejected, Storm running and Ended states have no serious or critical violation (package 23)", async ({ page }, testInfo) => {
  const states: PresenterFixtureState[] = ["pending", "reset-confirm", "rejected", "storm-running", "ended"];
  for (const state of states) {
    const fixture = await openPresenterFixture(page, state);
    if (state === "pending") await expect(page.locator(".presenter-beats [role=status]")).toContainText("Advancing to stop");
    if (state === "reset-confirm") await expect(page.getByRole("group", { name: "Confirm session reset" })).toBeVisible();
    if (state === "rejected") await expect(page.getByRole("list", { name: "Last command results" })).toContainText("BUSY");
    if (state === "storm-running") await expect(page.locator(".presenter-beats [role=status]")).toContainText("Storm running");
    if (state === "ended") await expect(page.locator(".presenter-session")).toContainText("ENDED");
    await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr19-${state}` });
    fixture.answer();
    fixture.stop();
  }
});

// Package 24: SCR-20 in each state of 03, from lib/setupFixture.ts (two MOCK candidate cards; a committed LOADED snapshot, because the
// harness's own session already has a plan and would only ever show Locked). The real route is scanned above.
test("axe: SCR-20 Ready, Computing, Command rejected and Locked states have no serious or critical violation (package 24)", async ({ page }, testInfo) => {
  const ready = await openSetupFixture(page, "ready");
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr20-ready` });
  expect(ready.sent).toEqual([]);
  ready.stop();

  const computing = await openSetupFixture(page, "computing");
  await page.getByRole("button", { name: "Select MOCK alternative" }).click();
  await expect(page.locator(".setup-state")).toHaveText(/^Computing haven fields/);
  expect(computing.sent).toEqual([{ kind: "SELECT_HAB_SITE", args: { candidate_id: "hab-mock-alternative" } }]);
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr20-computing` });
  computing.answer();
  await expect(page.locator(".setup-state")).toHaveText(/^Ready/);
  computing.stop();

  const rejected = await openSetupFixture(page, "rejected");
  await page.getByRole("button", { name: "Select MOCK alternative" }).click();
  await expect(page.getByRole("alert").filter({ hasText: REJECTION })).toBeVisible();
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr20-rejected` });
  rejected.stop();

  const locked = await openSetupFixture(page, "locked");
  await expect(page.getByRole("button", { name: "Select MOCK alternative" })).toBeDisabled();
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr20-locked` });
  locked.stop();
});

// Package 06: SCR-00, the boot error, in OPS mode (FD-207). A site whose manifest was deleted makes the planner boot fail.
test("axe: SCR-00 boot error has no serious or critical violation", async ({ page }, testInfo) => {
  await withManifestlessSite(async (siteId) => {
    await page.goto(`/?site=${siteId}#/planner`);
    await page.waitForLoadState("networkidle");
    await page.locator('[data-screen="SCR-00"]').waitFor();
    await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr00` });
  });
});

// Package 07: the planner workspace SCR-02 on the F4 site, in OPS mode.
test("axe: SCR-02 planner workspace has no serious or critical violation", async ({ page }, testInfo) => {
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr02` });
});

// Package 09: the SCR-04 plan panel in its Empty state (only the start) and its Invalid input state (an out-of-range entry shows
// its range inline). Editing is scanned below (package 10).
test("axe: SCR-04 plan panel Empty and Invalid input states have no serious or critical violation", async ({ page }, testInfo) => {
  // 04 §F specifies the planner from 1024 px; its top bar does not fit a 360 or 390 px portrait phone, so the drawer button is
  // out of reach there. The phone landscape (844 px) and every wider project are scanned.
  test.skip((page.viewportSize()?.width ?? 0) < 800, "the planner is specified from 1024 px (04 §F)");
  await openPlanTab(page);
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr04-empty` });
  const duration = page.getByLabel(/max eva duration/i);
  await duration.fill("-1");
  await expect(page.getByRole("alert").filter({ hasText: /duration/i })).toBeVisible();
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr04-invalid` });
});

// Package 10: SCR-04 Editing (two stops, the first selected result of the keyboard path) with the keyboard-move group showing.
test("axe: SCR-04 plan panel Editing state with a selected stop and the keyboard move has no serious or critical violation", async ({ page }, testInfo) => {
  test.skip((page.viewportSize()?.width ?? 0) < 800, "the planner is specified from 1024 px (04 §F)");
  await openPlanTab(page);
  await page.getByLabel(/EVA start/i).fill("2026-11-14T08:00:00Z");
  await addStopByKeyboard(page, 1);
  await addStopByKeyboard(page, 2);
  await page.getByRole("group", { name: "Move stop 2" }).waitFor();
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr04-editing` });
});


test("axe: EVA tablet states and high contrast have no serious or critical violation", async ({ page }, testInfo) => {
  const states: EvaFixtureState[] = ["walking", "at-stop", "undo-window", "ops-added-task", "alerting", "no-hab-link", "to-haven"];
  for (const state of states) {
    await openEvaFixture(page, state);
    if (state === "at-stop" || state === "ops-added-task") await page.getByTestId("tasks-button").click();
    await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-eva-${state}` });
    if (state === "alerting") await page.getByRole("button", { name: "Close options sheet" }).click();
    await page.getByRole("button", { name: "Toggle high contrast" }).click();
    await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-eva-${state}-contrast` });
  }
});


test("axe: ops states have no serious or critical violation (package 19)", async ({ context }, testInfo) => {
  for (const state of ["no-session", "loaded", "running", "paused", "alerting", "ended"] as const) {
    const page = await context.newPage();
    try {
    await openOpsFixture(page, state);
    if ((page.viewportSize()?.width ?? 0) >= 1024 && state !== "ended") {
      const panels = page.getByRole("button", { name: "Conditions & options" });
      if (await panels.count()) await panels.click();
    }
    await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-ops-${state}` });
    } finally { await page.close(); }
  }
});


test.fixme("needs N-06: ops receives an authoritative EVA phase", async ({ page }) => {
  await page.goto("/?site=mock_site#/ops");
  await expect(page.locator('.phase-timeline [data-provenance]')).not.toHaveText(/—/);
});
