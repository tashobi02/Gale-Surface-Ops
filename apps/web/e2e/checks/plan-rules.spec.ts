/**
 * Check `plan-rules` (replaces T08.11). Enabled by package 28.
 * The 02 §E.3 rules in the UI: each invalid input shows its inline error and keeps the last valid value; an outside-AOI or
 * impassable placement is refused or snapped by at most 50 m; SCR-04 shows Empty, Editing, Invalid and Computing.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPoiTasks } from "../lib/plannerTasks";
import { addStopByKeyboard, openPlanTab } from "../lib/planner";
import { installWorkerHold, releaseWorkerAnswers } from "../lib/workerHold";
import type { Snapshot } from "@marswalk/protocol";

const MAX_SNAP_M = 50;

/**
 * The 02 §E.3 input rules, one row per numeric field: the label the user sees, a value below the range, a value above
 * it and the range the error must name. The ranges are the ones `packages/compute/src/validate.ts` enforces (the same
 * function the worker and the Hab Core run), so the check and the app cannot drift apart.
 */
const E3_RULES = [
  { label: /max eva duration/i, below: "0.4", above: "10.1", range: "0.5–10 h" },
  { label: /dwell per stop/i, below: "-1", above: "181", range: "0–180 min" },
  { label: /caution slope/i, below: "1", above: "31", range: "2–30°" },
  { label: /hard slope limit/i, below: "4", above: "36", range: "5–35°" },
  { label: /walkback limit/i, below: "0.4", above: "20.1", range: "0.5–20 km" },
  { label: /suited flat speed/i, below: "0.4", above: "6.1", range: "0.5–6 km/h" },
  { label: /haven rule/i, below: "4", above: "121", range: "5–120 min" },
] as const;

// Package 28 (T08.11): every 02 §E.3 input rule, one value below and one above the range. The inline error names the
// range and the value that stays in effect; the last valid value never leaves the plan.
test("plan-rules: every 02 §E.3 input shows an inline error and keeps the last valid value", async ({ page }) => {
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  const panel = page.locator('[data-slot="plan-panel"]');
  await panel.waitFor();

  for (const rule of E3_RULES) {
    const field = page.getByLabel(rule.label);
    await expect(field, `${rule.label} is in the panel`).toBeVisible();
    const lastValid = await field.inputValue();
    expect(lastValid, `${rule.label} has a default`).not.toBe("");

    for (const bad of [rule.below, rule.above]) {
      await field.fill(bad);
      const alert = panel.getByRole("alert").filter({ hasText: new RegExp(escapeRegExp(rule.range)) });
      await expect(alert, `${rule.label} = ${bad}: the error names the range`).toBeVisible();
      // The error states which value stays in effect (FD-236: the last valid value, not the rejected one).
      await expect(alert, `${rule.label} = ${bad}: the error names the kept value`).toContainText(lastValid);
      await expect(field, `${rule.label} = ${bad}: the field is marked invalid`).toHaveAttribute("aria-invalid", "true");
      // Leaving the field returns its text to the last valid value; the rejected value was never sent. FD-236: the error
      // stays until the next edit or Reset, so it is still shown after the field is left.
      await field.blur();
      await expect(field, `${rule.label} = ${bad}: the text returns to the last valid value`).toHaveValue(lastValid);
      await expect(alert, `${rule.label} = ${bad}: the error stays until the next edit (FD-236)`).toBeVisible();
    }
  }
});

/** A regular-expression metacharacter in a range is escaped. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Package 28 (T08.11): the SCR-04 states of 03 SCR-04 — Empty (only the start), Editing (a stop is on the plan),
// Invalid input (a rejected value) and Computing (the worker is solving the latest revision).
test("plan-rules: SCR-04 shows Empty, Editing, Invalid and Computing", async ({ page }) => {
  // The worker's plan answer is held back, so Computing is a state the check can observe instead of a frame it may
  // miss: the plan store marks the plan Computing the moment the edit lands (03 §E.4).
  await installWorkerHold(page);
  await page.goto("/?site=mock_site&mock_worker=1#/planner");
  await page.waitForLoadState("networkidle");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  await page.getByRole("tab", { name: "Plan", exact: true }).click();
  const panel = page.locator('[data-slot="plan-panel"]');
  await panel.waitFor();
  // `data-plan-state` is on the panel section itself (03 SCR-04).
  const state = panel;

  // Empty: the start is set and the plan has no stop. The Hab Core's session answer may land while the check types, so the
  // field is emptied first and the value is typed into it afterwards (FD-042: the start has no default of its own).
  const start = page.getByLabel(/EVA start/i);
  await start.fill("");
  await start.fill("2026-11-14T08:00:00Z");
  await expect(start, "the start is the value the check typed").toHaveValue("2026-11-14T08:00:00Z");
  await expect(state, "the plan starts empty").toHaveAttribute("data-plan-state", "empty");

  // Computing: the edit has landed and the worker has not answered yet.
  await addStopByKeyboard(page, 1);
  await expect(state, "the plan is computing").toHaveAttribute("data-plan-state", "computing");

  // Editing: the worker answered and the plan holds a stop.
  await releaseWorkerAnswers(page);
  await expect(state, "the plan is editing").toHaveAttribute("data-plan-state", "editing");

  // Invalid: a rejected value puts the panel back into its invalid state and names the range. The Constraints accordion
  // collapses after the first edit (04 §B), so it is opened again to reach the field.
  const constraints = panel.getByRole("button", { name: "Constraints" });
  if ((await constraints.getAttribute("aria-expanded")) === "false") await constraints.click();
  const duration = page.getByLabel(/max eva duration/i);
  await duration.fill("-1");
  await expect(state, "the plan is invalid").toHaveAttribute("data-plan-state", "invalid");
  await expect(panel.getByRole("alert").filter({ hasText: /0\.5–10 h/ })).toBeVisible();
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

// The placeholder that stood for package 28 (T08.11) is gone: the SCR-04 states are checked above against the real app,
// not against a `?mock_state=` switch that the app does not have.

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

// T32.26-T32.28 (FR-54): the Hab Core's start is a default for an EMPTY field, never an edit of one the user is in. Playwright's `fill`, and a
// person, focus the field and then type; a default that landed in between put its text in the field with the caret after it, so the typed
// start was appended to it ("2024-05-20T00:00:00Z2026-11-14T08:00:00Z": invalid for good, `data-plan-state="invalid"`). It showed only when the
// answer was slow, i.e. in a full run on a loaded machine. The check holds the answer and sends it between the two halves of a `fill`.
const SESSION_START = "2024-05-20T00:00:00Z";
const TYPED_START = "2026-11-14T08:00:00Z";

async function openPlanTabWithHeldSessionStart(page: Page): Promise<{ start: Locator; panel: Locator; answerBetweenFocusAndTyping(): Promise<void> }> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/session/summary", async (route) => {
    await held;
    await route.fulfill({ json: { eva_start_utc: SESSION_START } });
  });
  await page.goto("/?site=mock_site#/planner");
  await page.locator('[data-slot="map-workspace"]').waitFor();
  const toggle = page.locator('[data-slot="drawer-toggle"][data-for="left"]');
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("tab", { name: "Plan" }).click();
  const panel = page.locator('[data-slot="plan-panel"]');
  await panel.waitFor();
  const start = page.getByLabel(/EVA start/i);
  await expect(start).toHaveValue("");
  return {
    start,
    panel,
    async answerBetweenFocusAndTyping() {
      // The first half of Playwright's fill: focus and select what is there. The second half is `keyboard.insertText`.
      await start.evaluate((el) => {
        (el as HTMLInputElement).focus();
        (el as HTMLInputElement).select();
      });
      const answered = page.waitForResponse("**/api/session/summary");
      release();
      await answered;
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    },
  };
}

test("plan-rules: the Hab Core's start default does not land in the EVA start field while the user is filling it (T32.26)", async ({ page }) => {
  const { start, panel, answerBetweenFocusAndTyping } = await openPlanTabWithHeldSessionStart(page);
  await answerBetweenFocusAndTyping();
  await page.keyboard.insertText(TYPED_START);
  await expect(start).toHaveValue(TYPED_START);
  await expect(panel).toHaveAttribute("data-plan-state", "empty");
  await page.keyboard.press("Tab");
  await expect(start).toHaveValue(TYPED_START);
  await expect(start).toHaveAttribute("data-source", "user:scenario.eva_start_utc");
});

test("plan-rules: the Hab Core's start default fills the EVA start field once the user leaves it empty (T32.26; FD-042)", async ({ page }) => {
  const { start, panel, answerBetweenFocusAndTyping } = await openPlanTabWithHeldSessionStart(page);
  await answerBetweenFocusAndTyping();
  await expect(start).toHaveValue("");
  await page.keyboard.press("Tab");
  await expect(start).toHaveValue(SESSION_START);
  await expect(start).toHaveAttribute("data-source", "session.eva_start_utc");
  await expect(panel).toHaveAttribute("data-plan-state", "empty");
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
