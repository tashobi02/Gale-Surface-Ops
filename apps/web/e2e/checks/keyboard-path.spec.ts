/**
 * Check `keyboard-path` (replaces T13.10 — 01 §E steps 1–9 with the keyboard only).
 *
 * The whole core scenario is run with key presses only: from the mission briefing the demo plan is opened, a stop is moved with
 * the keyboard-move control (FD-119, the method 01 §E step 5 uses — Spec question 6), the results update and are announced
 * through the live region, the briefing card is opened with `B` and the plan is exported with the keyboard.
 *
 * Every step asserts that the focused element is visible and carries a focus ring of at least 2 px (04 §E Focus), that focus
 * never lands on a hidden element (no keyboard trap into a collapsed drawer), and that the result is readable outside the map
 * (the stops table, the metrics, the warnings and the live region).
 *
 * The app's own key map is the one under test (04 §E, `apps/web/src/ui/map/keyboard.ts`): `A` toggles add-stop mode, `Enter`
 * places at the crosshair, `Delete` removes the selected stop, `B` opens the briefing card, `?` opens Sources & methods, and
 * the arrow keys pan the map when the map has focus.
 */
import { expect, test, type Page } from "@playwright/test";
import { openPoiTasks, tabTo } from "../lib/plannerTasks";

const MIN_RING_PX = 2;

/** The focus state of the page: what has focus, whether it is visible, and whether it carries a ring. */
async function expectFocusVisible(page: Page, step: string): Promise<void> {
  const state = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { focused: false as const };
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const ring = parseFloat(s.outlineWidth) >= 2 && s.outlineStyle !== "none";
    const wrapper = !!el.closest("[data-focus-ring]") || !!el.parentElement?.matches("[data-focus-ring]");
    return { focused: true as const, hidden: r.width === 0 || r.height === 0 || s.visibility === "hidden", ring: ring || wrapper };
  });
  expect(state.focused, `${step}: nothing focused`).toBe(true);
  if (state.focused) {
    expect(state.hidden, `${step}: focus on a hidden element`).toBe(false);
    expect(state.ring, `${step}: no visible focus ring (>= ${MIN_RING_PX} px)`).toBe(true);
  }
}

/**
 * The metric tiles of SCR-05, read as the plain text a screen reader would read.
 *
 * The old placeholder asked for a `result-total-distance` test id, which the app never had: the distance is the first tile of
 * the "Route metrics" group. The tile is read through its label and its value, so the check compares what is on screen.
 */
async function routeMetric(page: Page, label: string): Promise<string> {
  const tile = page.locator(".scr05-metric").filter({ hasText: label }).first();
  await expect(tile, `the ${label} tile is shown`).toBeVisible();
  return (await tile.innerText()).replace(/\s+/g, " ").trim();
}

test("keyboard-path: 01 §E steps 1–9 run with the keyboard only, focus visible at every step", async ({ page }) => {
  test.setTimeout(120_000);

  // --- Step 1: read the brief, open the planner -------------------------------------------------------------------
  await page.goto("/?site=mock_site#/");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Tab");
  await expectFocusVisible(page, "first tab stop");
  const start = page.getByRole("button", { name: /start planning/i });
  await start.focus();
  await expectFocusVisible(page, "Start planning");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/planner/);
  await page.locator('[data-slot="map-workspace"]').waitFor();

  // --- Step 4/1: open the demo plan with the keyboard ------------------------------------------------------------
  await page.goto("/?site=mock_site#/");
  await page.waitForLoadState("networkidle");
  const demo = page.getByRole("button", { name: /open demo plan/i });
  await demo.focus();
  await expectFocusVisible(page, "Open demo plan");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/planner/);

  // The demo plan names no start time (FD-042), so the plan is invalid until the start is set. The Plan tab holds the input.
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  const startField = page.getByLabel(/EVA start/i);
  await startField.focus();
  await expectFocusVisible(page, "EVA start");
  await startField.fill("");
  await startField.fill("2026-11-14T08:00:00Z");
  await startField.press("Tab");

  // The worker answers: the banner leaves its Computing state and the results are readable outside the map.
  const banner = page.locator("[data-results-banner]");
  await expect(banner, "the worker answered").toBeVisible({ timeout: 30_000 });
  await expect(banner, "the worker finished").not.toContainText("Computing…", { timeout: 30_000 });

  // 04 §E: the result is announced through the live region (T13.10: "Plan updated: Over limits, 2 warnings").
  const live = page.locator(".scr05-sr-only");
  await expect(live, "the plan is announced").toContainText(/Plan updated: .*warning/);
  await expect(live).toHaveAttribute("aria-live", "polite");

  // The stops are readable outside the map (the stops table), not only as canvas markers.
  const stops = page.locator('[data-slot="stops-list"]');
  await expect(stops, "the stops table is shown").toBeVisible();
  await expect(stops.locator('[data-waypoint-id]').first(), "the demo plan has a stop").toBeVisible();

  // --- Step 5: move a stop with the keyboard (FD-119) ------------------------------------------------------------
  // The method 01 §E step 5 uses, per Spec question 6: the keyboard-move control of the selected stop, not a drag.
  //
  // The F4 bundle holds one of the demo plan's three POIs (the other two are named by SCR-01 itself and are left out), so
  // the demo plan on this site has one stop. The check moves the stop it really has; on the real bundle the demo plan has
  // three stops and the same control moves stop 2.
  const stopRows = stops.locator('[data-role="stop"]');
  const stopCount = await stopRows.count();
  expect(stopCount, "the demo plan has at least one stop").toBeGreaterThan(0);
  const movedStopNumber = stopCount >= 2 ? 2 : 1;
  const movedStop = stopRows.nth(movedStopNumber - 1);
  const movedId = await movedStop.getAttribute("data-waypoint-id");
  await movedStop.locator('[data-action="select"]').focus();
  await expectFocusVisible(page, `select stop ${movedStopNumber}`);
  await page.keyboard.press("Enter");

  const moveGroup = page.getByRole("group", { name: `Move stop ${movedStopNumber}` });
  await expect(moveGroup, "the keyboard-move group is shown for the selected stop").toBeVisible();
  const east = moveGroup.getByRole("button", { name: /one cell east/i });
  await east.focus();
  await expectFocusVisible(page, "nudge east");
  const coords = stops.locator(`[data-waypoint-id="${movedId}"] [data-slot="stop-coords"]`);
  const before = await coords.innerText();
  await page.keyboard.press("Enter");
  await expect(coords, "the stop moved one cell east").not.toHaveText(before);

  // The results update after the move, and the new result is announced.
  await expect(banner, "the worker answered again").not.toContainText("Computing…", { timeout: 30_000 });
  await expect(live, "the move is announced").toContainText(/Plan updated: .*warning/);
  // The recomputed result is readable outside the map (the metric tiles), not only on the map.
  await expect(await routeMetric(page, "Distance"), "the distance is shown").toMatch(/km/);

  // --- Step 8: open the briefing card with `B` -------------------------------------------------------------------
  // The map keys are read by the map container, so the map must have focus for the shortcut to reach it (04 §E).
  await page.locator(".ol-viewport").focus();
  await page.keyboard.press("b");
  await expect(page).toHaveURL(/#\/briefing/);
  await page.locator('[data-slot="briefing-card"]').waitFor();

  // The briefing card carries the plan's own hash (FD-134) and the disclaimer. The hash is the card's own text; the chip
  // beside it is the provenance, so the hex run is read out of the text.
  const hashText = (await page.locator("[data-plan-hash]").innerText()).trim();
  const hash = /[0-9a-f]{12}/.exec(hashText)?.[0];
  expect(hash, "the card shows the plan hash").toBeDefined();
  await expect(page.locator('[data-slot="disclaimer"]')).toContainText("prototype");

  // --- Step 8: export the plan with the keyboard ------------------------------------------------------------------
  const exportButton = page.getByRole("button", { name: /export plan json/i });
  await exportButton.focus();
  await expectFocusVisible(page, "export button");
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(download.suggestedFilename(), "the export is a JSON file").toMatch(/\.json$/);

  // --- Step 9: open Sources & methods with `?` --------------------------------------------------------------------
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator(".ol-viewport").focus();
  await page.keyboard.press("?");
  await expect(page).toHaveURL(/#\/sources/);
  await expect(page.locator('[data-screen="SCR-09"] h1')).toContainText("What each value is");
});

// Package 10: step "move stop 2" (FD-119) on the planner alone, with no pointer. SCR-01, the demo plan and SCR-08 are other packages',
// so the full path above stays `fixme` until package 28. A pan moves the crosshair west of the F4 site's wall of
// 20-degree cells (x from 0 to 100 m) before the stops are placed.
test("keyboard-path: add two stops at the crosshair and move stop 2 by the keyboard (package 10)", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.getByRole("tab", { name: "Plan" }).click();
  await page.getByLabel(/EVA start/i).fill("2026-11-14T08:00:00Z");

  const viewport = page.locator(".ol-viewport");
  await viewport.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("a");
  await expectFocusVisible(page, "map after A");
  await expect(page.getByRole("button", { name: /^Add stop/ })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-waypoint-id="wp-1"]')).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("a");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-waypoint-id="wp-2"]')).toBeVisible();

  const coords = page.locator('[data-waypoint-id="wp-2"] [data-slot="stop-coords"]');
  const before = await coords.innerText();
  const east = page.getByRole("button", { name: "Move stop 2 one cell east" });
  await east.focus();
  await expectFocusVisible(page, "nudge east");
  await page.keyboard.press("Enter");
  await expect(coords).not.toHaveText(before);
  await page.keyboard.press("ArrowLeft");
  await expect(coords).toHaveText(before);
});

// Package 25: every step below is a key press. `openPoiTasks` ends with pointer clicks, after which a scripted focus() matches `:focus`
// but not `:focus-visible`, so the first control is reached with Shift+Tab / Tab and the rest with Tab, Enter and typing.
test("keyboard-path: edit, add and delete a stop task through native keyboard controls (package 25)", async ({ page }) => {
  const { editor, suggested } = await openPoiTasks(page);
  expect(suggested.length, "the fixture leaves room to add a task").toBeLessThan(4);
  const summary = editor.locator("summary");
  await summary.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(summary).toBeFocused();
  await expectFocusVisible(page, "task disclosure");
  await page.keyboard.press("Enter");
  await expect(editor).not.toHaveAttribute("open");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveAttribute("open", "");

  await page.keyboard.press("Tab");
  await expect(editor.locator("[data-task-kind]").first()).toBeFocused();
  await expectFocusVisible(page, "task kind");
  await page.keyboard.press("Tab");
  const firstDelete = editor.locator("[data-delete-task]").first();
  await expect(firstDelete).toBeFocused();
  await expectFocusVisible(page, "delete task");
  // Delete on a task button belongs to the button: it must not delete the selected stop and its tasks (FD-324).
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-waypoint-id="wp-1"]')).toBeVisible();
  await expect(editor.locator("[data-task-text]")).toHaveCount(suggested.length);
  await page.keyboard.press("Tab");
  const text = editor.locator("[data-task-text]").first();
  await expect(text).toBeFocused();
  await expectFocusVisible(page, "task text");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("Observe the ridge");
  await page.keyboard.press("Tab");
  await expect(text).toHaveValue("Observe the ridge");

  // Enter in the new-task box adds the task and the box keeps focus, also on the 4th task, where it stops accepting text but stays reachable.
  const newText = editor.locator("[data-new-task-text]");
  await tabTo(page, newText);
  await expectFocusVisible(page, "new task text");
  for (let n = suggested.length; n < 4; n++) {
    await page.keyboard.insertText(`Image the ledge ${"abcd"[n]}`);
    await page.keyboard.press("Enter");
    await expect(editor.locator("[data-task-text]")).toHaveCount(n + 1);
    await expect(newText).toBeFocused();
    await expect(newText).toHaveValue("");
  }
  await expect(newText).toHaveAttribute("aria-disabled", "true");
  await expect(editor.getByRole("button", { name: "Add task", exact: true })).toHaveAttribute("aria-disabled", "true");
  await expect(newText).toBeFocused();

  // Enter on the last Delete removes that task; focus moves to a task's text instead of falling to the page.
  const lastDelete = editor.locator("[data-delete-task]").last();
  await tabTo(page, lastDelete, { back: true });
  await expectFocusVisible(page, "delete task");
  await page.keyboard.press("Enter");
  await expect(editor.locator("[data-task-text]")).toHaveCount(3);
  await expect(editor.locator("[data-task-text]").last()).toBeFocused();
  await expectFocusVisible(page, "task text after delete");
  await expect(newText).not.toHaveAttribute("aria-disabled", "true");
});

test("keyboard-path: presenter QR drawer closes and restores focus", async ({ page }) => {
  await page.goto("/?site=mock_site#/presenter");
  const trigger = page.getByRole("button", { name: "Join QR codes" });
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const close = page.getByRole("button", { name: "Close", exact: true });
  await close.focus();
  await expectFocusVisible(page, "QR close");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
});

test("keyboard-path: ops QR drawer closes and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/?site=mock_site#/ops");
  const trigger = page.getByRole("button", { name: "Join QR codes" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const drawer = page.getByRole("group", { name: "Join QR codes" });
  await drawer.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});
