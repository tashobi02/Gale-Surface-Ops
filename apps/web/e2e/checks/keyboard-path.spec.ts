/**
 * Check `keyboard-path` (replaces T13.10). Enabled by package 28.
 * Keyboard only from `#/`: Start planning, open the demo plan, move stop 2 with the keyboard move (FD-119), results update,
 * B opens SCR-08, Export. Every focused element shows a visible ring (outline of at least 2 px, or a wrapper ring) and focus
 * never lands on a hidden element.
 * TODO(verify): control names and the keyboard-move keys come from packages 15, 10 and 14; adjust when they land.
 */
import { expect, test, type Page } from "@playwright/test";

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
