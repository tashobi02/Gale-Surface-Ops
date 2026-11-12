/**
 * Check `print` (replaces T11.05 and the page counts of T27.06). Enabled by packages 28 and 29.
 * SCR-08 is one page on A4 and on Letter for OK, Over limits and Partial; SCR-17 is at most two pages on A4 and on Letter, with
 * 12 mm margins.
 */
import { expect, test } from "@playwright/test";
import { openBriefing, BRIEFING_STATES } from "../lib/briefing";
import { pdfPages } from "../lib/print";

const FORMATS = ["A4", "Letter"] as const;
const SCR08_PAGES = 1;
const SCR17_MAX_PAGES = 2;

test("print: SCR-08 is one page on A4 and Letter for OK, Over limits and Partial (package 14)", async ({ page }) => {
  test.setTimeout(120_000);
  for (const fixture of BRIEFING_STATES) {
    await openBriefing(page, fixture);
    await expect(page.locator('[data-slot="disclaimer"]')).toContainText("It is not astronaut operations software.");
    if (fixture === "partial") {
      await expect(page.locator('[data-slot="banner"]')).toContainText("Plan incomplete — not valid for use");
      await expect(page.locator('[data-slot="totals"]')).toHaveCount(0);
    }
    if (fixture === "over-limits") await expect(page.locator('[data-slot="banner"]')).toContainText("Max walkback");
    for (const format of FORMATS) {
      expect(await pdfPages(page, { format, margin: "12mm" }), `${fixture} ${format}`).toBe(SCR08_PAGES);
      await page.emulateMedia({ media: "print" });
      const clipped = await page.locator('.scr08-card').evaluate(card => [...card.querySelectorAll('th,td,p,h1,h2')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
      expect(clipped, `${fixture}: clipped print text`).toEqual([]);
      await page.emulateMedia({ media: null });
    }
  }
});

test.fixme("print: SCR-17 is at most two pages on A4 and Letter (enabled by package 29)", async ({ page }) => {
  await page.goto("/#/report");
  await page.waitForLoadState("networkidle");
  for (const format of FORMATS) expect(await pdfPages(page, { format, margin: "12mm" }), format).toBeLessThanOrEqual(SCR17_MAX_PAGES);
});
