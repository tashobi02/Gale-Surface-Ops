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
import { UTILITY_ROVER, openOpsFixture, openOpsPanel } from "../lib/opsFixture";
import { withManifestlessSite } from "../lib/siteBundle";
import { openPoiTasks } from "../lib/plannerTasks";

const LIVE = /^#\/(ops|eva|hud)/;

// Routes that render real content today. Each screen package adds its own route here when it builds the screen, until the
// list equals `routeHashes()` (package 99 asserts that).
// Package 15 adds the two BRIEF routes it builds: `#/` (SCR-01) and `#/sources` (SCR-09); package 17 adds `#/eva/EV1`.
const BUILT_ROUTES = ["#/", "#/sources", "#/join", "#/ops", "#/hud/EV1", "#/eva/EV1", "#/report"];

test("axe: every built route has no serious or critical violation", async ({ page }, testInfo) => {
  for (const hash of BUILT_ROUTES) {
    await page.goto(`/?site=${process.env.E2E_SITE ?? "mock_site"}${hash}`);
    await page.waitForLoadState("networkidle");
    if (hash === "#/") await expect(page.locator('[data-screen="SCR-01"] h1')).toContainText("Plan the walk");
    if (hash === "#/sources") await expect(page.locator('[data-screen="SCR-09"] h1')).toContainText("What each value is");
    // FD-210: below 1024 px the ops route shows only the "Use a larger screen" notice, which has no values to wait for.
    if (hash === "#/ops" && (page.viewportSize()?.width ?? 1280) < 1024) await page.getByRole("heading", { name: "Use a larger screen" }).waitFor();
    else if (LIVE.test(hash)) await waitForSnapshot(page);
    const mode = (await page.evaluate(() => document.documentElement.dataset.mode)) as HtmlMode;
    await axeScan(page, { mode, route: `${testInfo.project.name}-${hash}` });
  }
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


test("axe: EVA tablet states and high contrast have no serious or critical violation", async ({ context }, testInfo) => {
  test.setTimeout(180_000);
  const states: EvaFixtureState[] = ["walking", "at-stop", "undo-window", "ops-added-task", "alerting", "alerting-with-options", "no-hab-link", "to-haven"];
  for (const state of states) {
    // A fresh page per state: the same `#/eva/EV1` URL is a fragment navigation, so an open task sheet and the contrast
    // toggle would carry over into the next state.
    const page = await context.newPage();
    try {
      await openEvaFixture(page, state);
      if (state === "at-stop" || state === "ops-added-task") await page.getByTestId("tasks-button").click();
      await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-eva-${state}` });
      // The options sheet only opens for a warning that CARRIES options (FD-081). The plain alerting fixture raises a
      // warning without any, so there is no sheet to close — the crew member opens it from the alert bar's OPTIONS button.
      if (state === "alerting-with-options") await page.getByRole("button", { name: "Close options sheet" }).click();
      await page.getByRole("button", { name: "Toggle high contrast" }).click();
      await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-eva-${state}-contrast` });
    } finally { await page.close(); }
  }
});


test("axe: ops states have no serious or critical violation (package 19)", async ({ context }, testInfo) => {
  // Up to 26 scans (6 states x base, side panels, task editor, log drawer) do not fit the 60 s default.
  test.setTimeout(240_000);
  for (const state of ["no-session", "loaded", "running", "paused", "alerting", "ended"] as const) {
    const page = await context.newPage();
    try {
      await openOpsFixture(page, state);
      const route = `${testInfo.project.name}-ops-${state}`;
      await axeScan(page, { mode: state === "ended" ? "print" : "ops", route });
      if ((page.viewportSize()?.width ?? 0) >= 1024 && state !== "ended") {
        await openOpsPanel(page, "mission");
        await axeScan(page, { mode: "ops", route: `${route}-mission` });
        await openOpsPanel(page, "crew");
        await axeScan(page, { mode: "ops", route: `${route}-crew` });
        if (state !== "no-session" && state !== "alerting") {
          await page.getByRole("button", { name: "Add task for EV1" }).click();
          await expect(page.getByRole("dialog", { name: "Add stop task" })).toBeVisible();
          await axeScan(page, { mode: "ops", route: `${route}-task-editor` });
          await page.getByRole("button", { name: "Close add task popover" }).click();
        }
        await page.locator('[data-slot="event-log-strip"]').click();
        await expect(page.getByRole("dialog", { name: "Event log", exact: true })).toBeVisible();
        await axeScan(page, { mode: "ops", route: `${route}-log` });
        await page.keyboard.press("Escape");
        await expect(page.locator('[data-slot="event-log-strip"]')).toBeFocused();
      }
    } finally { await page.close(); }
  }
});

test("axe: ops rover card and SCR-15 rover tasking have no serious or critical violation (package 21)", async ({ page }, testInfo) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, "the ops console needs >= 1024 px");
  await openOpsFixture(page, "running", { vehicles: [UTILITY_ROVER] });
  await openOpsPanel(page, "crew");
  await page.getByRole("button", { name: "Task rover UR1" }).click();
  await expect(page.locator('[data-screen="SCR-15"]')).toBeVisible();
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-ops-rover-task` });
  await page.locator('[data-screen="SCR-15"] [data-task="SCOUT"]').click();
  await page.getByRole("button", { name: "Pick on map" }).click();
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-ops-rover-placing` });
});

test.fixme("needs N-06: ops receives an authoritative EVA phase", async ({ page }) => {
  await page.goto("/?site=mock_site#/ops");
  await expect(page.locator('.phase-timeline [data-provenance]')).not.toHaveText(/—/);
});

// Package 25: one axe scan per test, scoped to the plan panel. Three full-page scans plus their setup in one test passed the 60 s limit
// on the phone-landscape and HUD projects (a full planner scan walks the SCR-05 profile chart: 16 to 22 s on a quiet machine, more under
// load). The task editor states change only the plan panel; the rest of the page is scanned by the SCR-02 and SCR-04 tests above.
const TASK_EDITOR_MIN_WIDTH = 800;
const PLAN_PANEL = '[data-slot="plan-panel"]';
const skipBelowPlanner = (width: number | undefined): void => test.skip((width ?? 0) < TASK_EDITOR_MIN_WIDTH, "the planner is specified from 1024 px (04 §F)");

test("axe: SCR-04 task editor populated state has no serious or critical violation (package 25)", async ({ page }, testInfo) => {
  skipBelowPlanner(page.viewportSize()?.width);
  await openPoiTasks(page);
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr04-tasks`, include: PLAN_PANEL });
});

test("axe: SCR-04 task editor invalid-text state has no serious or critical violation (package 25)", async ({ page }, testInfo) => {
  skipBelowPlanner(page.viewportSize()?.width);
  const { editor } = await openPoiTasks(page);
  await editor.locator("[data-task-text]").first().fill("");
  await expect(editor.getByRole("alert")).toBeVisible();
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr04-task-invalid`, include: PLAN_PANEL });
});

test("axe: SCR-04 task editor four-task limit state has no serious or critical violation (package 25)", async ({ page }, testInfo) => {
  skipBelowPlanner(page.viewportSize()?.width);
  const { editor, suggested } = await openPoiTasks(page);
  for (let n = suggested.length; n < 4; n++) {
    await editor.locator("[data-new-task-text]").fill(suggested[0]!.text);
    await editor.getByRole("button", { name: "Add task", exact: true }).click();
  }
  await expect(editor.locator("[data-task-text]")).toHaveCount(4);
  await axeScan(page, { mode: "ops", route: `${testInfo.project.name}-scr04-task-limit`, include: PLAN_PANEL });
});
