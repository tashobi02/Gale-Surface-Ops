/**
 * Check `plan-rules` (replaces T08.11). Enabled by package 28.
 * The 02 §E.3 rules in the UI: each invalid input shows its inline error and keeps the last valid value; an outside-AOI or
 * impassable placement is refused or snapped by at most 50 m; SCR-04 shows Empty, Editing, Invalid and Computing.
 */
import { expect, test } from "@playwright/test";
import { openPoiTasks } from "../lib/plannerTasks";
import { addStopByKeyboard, openPlanTab } from "../lib/planner";
import type { Snapshot } from "@marswalk/protocol";

const MAX_SNAP_M = 50;

test.fixme("plan-rules: invalid inputs show an inline error and keep the last valid value (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/planner");
  await page.waitForLoadState("networkidle");
  const field = page.getByLabel(/max eva duration/i);
  const valid = await field.inputValue();
  await field.fill("-1");
  await field.blur();
  await expect(page.getByRole("alert").filter({ hasText: /duration/i })).toBeVisible();
  await expect(field).toHaveValue(valid);
});

// Package 10: the placement rules on the F4 site (60 x 60 cells of 100 m; its wall of 20-degree cells has x from 0 to 100 m and a gap at
// y from -100 to 0 only, so no passable cell centre lies within the 50 m snap radius of (50, 1000)). `?debug=1` installs `window.__tryPlace(x_m, y_m)`.
test("plan-rules: outside-AOI and impassable placements are refused, a passable one is placed (package 10)", async ({ page }) => {
  await page.goto("/?site=mock_site&debug=1#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.waitForFunction(() => typeof (window as unknown as { __tryPlace?: unknown }).__tryPlace === "function");
  type Tried = { outcome: string; added: { x_m: number; y_m: number } | null };
  const tryPlace = (x: number, y: number): Promise<Tried> =>
    page.evaluate(([px, py]) => (window as unknown as { __tryPlace: (x: number, y: number) => Promise<Tried> }).__tryPlace(px!, py!), [x, y]);
  const notice = page.locator('[data-slot="placement-notice"] [data-slot="notice"]');

  const outside = await tryPlace(99999, 0);
  expect(outside).toMatchObject({ outcome: "outside", added: null });
  await expect(notice).toContainText("Outside mapped area");

  const steep = await tryPlace(50, 1000);
  expect(steep).toMatchObject({ outcome: "refused", added: null });
  await expect(notice).toContainText(/Not walkable here \(slope [\d.]+° > [\d.]+° limit\)/);

  const ok = await tryPlace(-1000, 1000);
  expect(ok.outcome).toBe("placed");
  expect(ok.added).toEqual({ x_m: -1000, y_m: 1000 });
  await expect(notice).toHaveAttribute("data-empty", "true");
});

test.fixme("plan-rules: SCR-04 shows Empty, Editing, Invalid and Computing (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/planner");
  for (const state of ["Empty", "Editing", "Invalid", "Computing"]) {
    await page.goto(`/#/planner?mock_state=${state.toLowerCase()}`);
    await expect(page.locator("[data-plan-state]")).toHaveAttribute("data-plan-state", state.toLowerCase());
  }
});

test("plan-rules: POI tasks are editable within FR-54 limits, removed with the stop and restored by Undo (package 25)", async ({ page }) => {
  const { editor, suggested } = await openPoiTasks(page);
  const text = editor.locator("[data-task-text]").first();
  await expect(text).toHaveValue(suggested[0]!.text);
  await text.fill("a".repeat(60));
  await text.blur();
  await expect(text).toHaveValue("a".repeat(60));
  for (const [invalid, problem] of [["", /empty or only spaces/], ["   ", /empty or only spaces/], ["a".repeat(61), /at most 60 characters/]] as const) {
    await text.fill(invalid);
    await expect(editor.getByRole("alert")).toContainText(problem);
    await expect(editor.getByRole("alert")).toContainText("Keeping the last valid text.");
    await expect(text).toHaveAttribute("aria-invalid", "true");
    await text.blur();
    // The box shows the last valid text again, and the error about the rejected text goes with it.
    await expect(text).toHaveValue("a".repeat(60));
    await expect(editor.getByRole("alert")).toHaveCount(0);
    await expect(text).not.toHaveAttribute("aria-invalid", "true");
  }
  await text.fill(suggested[0]!.text);
  const kind = editor.locator("[data-task-kind]").first();
  await kind.selectOption("observe");
  await expect(kind).toHaveValue("observe");
  for (let n = suggested.length; n < 4; n++) {
    await editor.locator("[data-new-task-kind]").selectOption("image");
    await editor.locator("[data-new-task-text]").fill(suggested[0]!.text);
    await editor.getByRole("button", { name: "Add task", exact: true }).click();
  }
  await expect(editor.locator("[data-task-text]")).toHaveCount(4);
  // aria-disabled, not disabled: a control that holds focus must keep it (package 25 review).
  const add = editor.getByRole("button", { name: "Add task", exact: true });
  await expect(add).toHaveAttribute("aria-disabled", "true");
  await expect(add).not.toHaveAttribute("disabled", /.*/);
  await expect(editor.locator("[data-new-task-text]")).toHaveAttribute("aria-disabled", "true");
  await expect(editor).toContainText("at most 4 tasks");
  for (let n = 4; n > 1; n--) await editor.locator("[data-delete-task]").last().click();
  const only = editor.locator("[data-delete-task]");
  await expect(only).toHaveAttribute("aria-disabled", "true");
  await expect(only).not.toHaveAttribute("disabled", /.*/);
  await expect(editor).toContainText("at least one task");
  await page.getByRole("button", { name: "Delete stop 1", exact: true }).click();
  await expect(page.locator("[data-stop-task-editor]")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.locator("[data-task-text]")).toHaveCount(1);
  await expect(text).toHaveValue(suggested[0]!.text);
});

test("plan-rules: a free stop starts without tasks and can author its first one (package 25)", async ({ page }) => {
  await openPlanTab(page);
  await addStopByKeyboard(page, 1);
  const editor = page.locator("[data-stop-task-editor]");
  await expect(editor).toContainText("No tasks");
  await expect(editor.locator("[data-task-text]")).toHaveCount(0);
  await editor.locator("[data-new-task-text]").fill("Observe the ridge");
  await editor.locator("[data-new-task-text]").press("Enter");
  await expect(editor.locator("[data-task-text]")).toHaveValue("Observe the ridge");
});

test("plan-rules: a POI stop says the task library is unavailable, not empty, and Retry loads it (package 25 review; FD-325)", async ({ page }) => {
  // The library is Snapshot.task_library on GET api/session (N-07): a failing session leaves it unavailable.
  await page.route("**/api/session", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await openPlanTab(page);
  await page.getByLabel(/EVA start/i).fill("2026-11-14T08:00:00Z");
  const poi = page.locator("button[data-poi-id]").first();
  await poi.focus();
  await poi.press("Enter");
  const detail = page.getByRole("region", { name: "POI detail", exact: true });
  await expect(detail.getByRole("region", { name: "Suggested tasks" })).toContainText("Task library unavailable");
  await detail.getByRole("button", { name: "Add as stop" }).click();
  const left = page.locator('[data-drawer="left"]');
  if (await left.isHidden()) await page.locator('[data-slot="drawer-toggle"][data-for="left"]').click();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  const editor = page.locator('[data-waypoint-id="wp-1"] [data-stop-task-editor]');
  await expect(editor).toContainText("Task library unavailable — suggested tasks not loaded");
  await expect(editor.locator('[data-task-library] [data-unavailable="true"]')).toBeVisible();
  await expect(editor).not.toContainText("No tasks");
  await expect(editor.locator("[data-task-text]")).toHaveCount(0);

  await page.unroute("**/api/session");
  await editor.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(editor.locator("[data-task-text]").first()).toBeVisible();
  await expect(editor.locator("[data-task-library]")).toHaveCount(0);
  await expect(editor.locator("[data-new-task-text]")).toBeFocused();
  await expect(detail.getByRole("region", { name: "Suggested tasks" })).not.toContainText("unavailable");
});

test.fixme("plan-rules: republishing replaces planner drafts at retained stops without duplicates (needs N-70)", async ({ page }) => {
  const { editor } = await openPoiTasks(page);
  const snapshot = async (): Promise<Snapshot> => (await page.request.get("api/session")).json();
  const publish = async () => {
    await page.locator('[data-slot="briefing"]').click();
    await page.getByRole("button", { name: /publish to hab core/i }).click();
  };
  await publish();
  await expect.poll(async () => (await snapshot()).tasks.some(task => task.task_id.startsWith("wp-1:") && task.state !== "DROPPED")).toBe(true);
  await page.goBack();
  const left = page.locator('[data-drawer="left"]');
  if (await left.isHidden()) await page.locator('[data-slot="drawer-toggle"][data-for="left"]').click();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  await editor.locator("[data-task-text]").first().fill("Observe the ridge");
  const remove = editor.locator("[data-delete-task]").last();
  if (await remove.isEnabled()) await remove.click();
  const expected = await editor.locator("[data-task-text]").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
  await publish();
  await expect.poll(async () => (await snapshot()).tasks.filter(task => task.stop_id === "wp-1" && task.origin === "plan" && task.state !== "DROPPED").map(task => task.text)).toEqual(expected);
});
