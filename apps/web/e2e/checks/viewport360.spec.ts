/**
 * Check `viewport360` (04 §F: BRIEF fluid, EVA at least 360 px). Enabled by package 03 (BRIEF routes) and 17 (EVA).
 * At 360 x 740 there is no horizontal scroll and no text box wider than its container.
 */
import { expect, test, type Page } from "@playwright/test";
import { routeHashesInMode } from "../lib/offline";

async function expectNoOverflow(page: Page, where: string): Promise<void> {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const clipped: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || !el.textContent?.trim()) continue;
      // A box that cuts its text on purpose (text-overflow: ellipsis) is not a clipped text box: the EVA tablet's 24 px
      // metadata strip is one fixed row, so a part that does not fit is cut with an ellipsis (FD-032). What must never
      // happen is a box whose text is cut off without saying so.
      if (s.textOverflow === "ellipsis") continue;
      if (el.scrollWidth > el.clientWidth + 1 && s.overflowX !== "auto" && s.overflowX !== "scroll" && el.clientWidth > 0) {
        clipped.push(`${el.tagName.toLowerCase()}.${el.className}`);
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, clipped: clipped.slice(0, 10) };
  });
  expect(result.scrollWidth, `${where}: horizontal scroll`).toBeLessThanOrEqual(result.clientWidth);
  expect(result.clipped, `${where}: clipped text boxes`).toEqual([]);
}

test("viewport360: BRIEF routes fit 360 px", async ({ page }) => {
  for (const hash of routeHashesInMode(["brief"])) {
    await page.goto(`/${hash}`);
    await page.waitForLoadState("networkidle");
    await expectNoOverflow(page, hash);
  }
});

test("viewport360: the EVA tablet fits 360 px (enabled by package 17)", async ({ page }) => {
  await page.goto("/#/eva/EV1");
  await page.waitForLoadState("networkidle");
  await expectNoOverflow(page, "#/eva/EV1");
});
