/**
 * Check `print` (replaces T11.05 and the page counts of T27.06). Enabled by packages 28 and 29.
 * SCR-08 is one page on A4 and on Letter for OK, Over limits and Partial; SCR-17 is at most two pages on A4 and on Letter, with
 * 12 mm margins.
 */
import { expect, test } from "@playwright/test";
import { openBriefing, BRIEFING_STATES } from "../lib/briefing";
import { cssPageMarginApplies, pdfMediaBox, pdfPages } from "../lib/print";

const FORMATS = ["A4", "Letter"] as const;
const SCR08_PAGES = 1;
const SCR17_MAX_PAGES = 2;
/** A4 and Letter in PostScript points: 210 x 297 mm and 8.5 x 11 in. */
const PAGE_POINTS: Record<(typeof FORMATS)[number], [number, number]> = { A4: [595, 842], Letter: [612, 792] };

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
      // Every text block, not only the table cells: a clipped value is a value a crew cannot read on paper.
      const clipped = await page.locator('.scr08-card').evaluate(card => [...card.querySelectorAll('th,td,p,h1,h2,span,div,figcaption,li')]
        .filter(el => el.children.length === 0 && el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
      expect(clipped, `${fixture}: clipped print text`).toEqual([]);
      await page.emulateMedia({ media: null });
    }
  }
});

test("print: SCR-08 prints on the CSS @page margin, not a PDF option (package 14)", async ({ page }) => {
  test.setTimeout(120_000);
  await openBriefing(page, "ok");
  // The `@page { margin: 12mm }` rule of `scr08BriefingCard.css` is authoritative in Chromium: it overrides the
  // `page.pdf({ margin })` option. If the rule were dead (a stylesheet the browser never read), the two margins
  // below would differ, so this fails when the rule stops applying.
  expect(await cssPageMarginApplies(page, "A4"), "the CSS @page margin is not the applied margin").toBe(true);
  for (const format of FORMATS) {
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format, printBackground: true });
    await page.emulateMedia({ media: null });
    const box = pdfMediaBox(pdf);
    expect(box, `${format}: the PDF has no MediaBox`).not.toBeNull();
    const [expectedWidth, expectedHeight] = PAGE_POINTS[format];
    expect(box![2] - box![0], `${format} width`).toBeCloseTo(expectedWidth, -1);
    expect(box![3] - box![1], `${format} height`).toBeCloseTo(expectedHeight, -1);
  }
});

test.fixme("print: SCR-17 is at most two pages on A4 and Letter (enabled by package 29)", async ({ page }) => {
  await page.goto("/#/report");
  await page.waitForLoadState("networkidle");
  for (const format of FORMATS) expect(await pdfPages(page, { format, margin: "12mm" }), format).toBeLessThanOrEqual(SCR17_MAX_PAGES);
});
