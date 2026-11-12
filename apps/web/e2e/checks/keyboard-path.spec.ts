/**
 * Check `keyboard-path` (replaces T13.10). Enabled by package 28.
 * Keyboard only from `#/`: Start planning, open the demo plan, move stop 2 with the keyboard move (FD-119), results update,
 * B opens SCR-08, Export. Every focused element shows a visible ring (outline of at least 2 px, or a wrapper ring) and focus
 * never lands on a hidden element.
 * TODO(verify): control names and the keyboard-move keys come from packages 15, 10 and 14; adjust when they land.
 */
import { expect, test, type Page } from "@playwright/test";
import { openPoiTasks } from "../lib/plannerTasks";

const MIN_RING_PX = 2;

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

test.fixme("keyboard-path: plan, move a stop, open the briefing and export without a pointer (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Tab");
  await expectFocusVisible(page, "first tab stop");
  await page.getByRole("link", { name: /start planning/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/planner/);
  await page.getByRole("button", { name: /demo plan/i }).focus();
  await page.keyboard.press("Enter");
  const before = await page.getByTestId("result-total-distance").innerText();
  await page.getByRole("button", { name: /stop 2/i }).focus();
  await page.keyboard.press("m");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("result-total-distance")).not.toHaveText(before);
  await page.keyboard.press("b");
  await expect(page).toHaveURL(/#\/briefing/);
  await page.getByRole("button", { name: /export/i }).focus();
  await expectFocusVisible(page, "export button");
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

test("keyboard-path: edit, add and delete a stop task through native keyboard controls (package 25)", async ({ page }) => {
  const { editor, suggested } = await openPoiTasks(page);
  const summary = editor.locator("summary");
  await summary.focus();
  await expectFocusVisible(page, "task disclosure");
  await page.keyboard.press("Enter");
  await expect(editor).not.toHaveAttribute("open");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(editor.locator("[data-task-kind]").first()).toBeFocused();
  await expectFocusVisible(page, "task kind");
  const text = editor.locator("[data-task-text]").first();
  await text.focus();
  await expectFocusVisible(page, "task text");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText("Observe the ridge");
  await text.press("Tab");
  await expect(text).toHaveValue("Observe the ridge");
  const newText = editor.locator("[data-new-task-text]");
  await newText.focus();
  await page.keyboard.insertText(suggested[0]!.text);
  await page.keyboard.press("Enter");
  await expect(editor.locator("[data-task-text]")).toHaveCount(suggested.length + 1);
  const remove = editor.locator("[data-delete-task]").last();
  await remove.focus();
  await expectFocusVisible(page, "delete task");
  await page.keyboard.press("Enter");
  await expect(editor.locator("[data-task-text]")).toHaveCount(suggested.length);
});
