/**
 * Check `eva-warning` (FD-081; 04 §E.5 "HAVEN, O₂ and the action row never move or get covered"). Enabled by package 17.
 *
 * At 844 x 390, 1024 x 768 and 390 x 844, with an unacknowledged warning:
 * - a warning with NO options yet does not open the SCR-14 sheet at all (it would cover the tablet to say "no options
 *   proposed yet");
 * - a warning WITH options opens the sheet, and the hit test at the centre of ABORT, SUMMON, TASK ROVER, HUD and the
 *   HAVEN and O₂ values still returns that element (or a descendant): the sheet never covers them.
 */
import { expect, test, type Page } from "@playwright/test";
import { openEvaFixture } from "../lib/evaFixture";

/** The elements that must stay reachable while the options sheet is open (04 §E.5). */
const REACHABLE = [
  { selector: "[data-slot=haven] .value", label: "HAVEN value" },
  { selector: "[data-slot=o2] .value", label: "O₂ value" },
  { selector: "#action-abort-hab", label: "ABORT" },
  { selector: "#action-summon-rover", label: "SUMMON" },
  { selector: "#action-task-rover", label: "TASK ROVER" },
  { selector: "#action-open-hud", label: "HUD" },
];

const VIEWPORTS = [
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

/** Whether the element at the centre of `selector` is that element or one of its descendants. */
async function isOnTop(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return Boolean(top) && (el === top || el.contains(top));
  }, selector);
}

test("eva-warning: a warning with no options yet does not open the sheet over the tablet (FD-081)", async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await openEvaFixture(page, "alerting");
    await page.waitForTimeout(400);
    await expect(page.locator('[data-screen="SCR-14"]'), `${viewport.width}x${viewport.height}: the sheet opened without options`).toHaveCount(0);
  }
});

test("eva-warning: the sheet never covers HAVEN, O₂ or the action row (FD-081, 04 §E.5)", async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await openEvaFixture(page, "alerting-with-options");
    await page.locator('[data-screen="SCR-14"]').waitFor();
    await page.waitForTimeout(300);
    for (const { selector, label } of REACHABLE) {
      expect(await isOnTop(page, selector), `${viewport.width}x${viewport.height}: ${label} is covered by the options sheet`).toBe(true);
    }
  }
});
