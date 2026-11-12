/**
 * Check `print` (replaces T11.05 and the page counts of T27.06). Enabled by packages 28 and 29.
 * SCR-08 is one page on A4 and on Letter for OK, Over limits and Partial; SCR-17 is at most two pages on A4 and on Letter, with
 * 12 mm margins. SCR-17 is printed populated (`/api/report` answered with a complete report of 3, 5 and 6 stops, up to 3
 * alerts and a crew trace; tests/fixtures/postEvaReport.ts) and with the page's own CSS `@page` margin, not one passed here.
 */
import { expect, test } from "@playwright/test";
import { openBriefing, BRIEFING_STATES } from "../lib/briefing";
import { cssPageMarginApplies, pdfMediaBox, pdfPages } from "../lib/print";
import { populatedReport } from "../../tests/fixtures/postEvaReport";

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

for (const [stops, alerts] of [[3, 1], [5, 2], [6, 3]] as const) {
  test(`print: SCR-17 with ${stops} stops, ${alerts} alerts and a trace is at most two pages on A4 and Letter`, async ({ page }) => {
    const report = populatedReport({ stops, alerts });
    await page.route("**/api/report", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(report) }));
    await page.goto("/#/report");
    await expect(page.locator('[data-slot="report-trace"]')).toBeVisible();
    await expect(page.locator('[data-slot="report-status"]')).toHaveCount(0);
    // The @page rule is the page's own and applies (a stylesheet the CSP allows): 12 mm on every side.
    const pageRules = await page.evaluate(() =>
      [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).filter((r) => r.constructor.name === "CSSPageRule").map((r) => r.cssText),
    );
    expect(pageRules.some((rule) => /margin:\s*12mm/.test(rule)), pageRules.join(" | ")).toBe(true);
    for (const format of FORMATS) expect(await pdfPages(page, { format, margin: "css" }), `${stops} stops, ${alerts} alerts, ${format}`).toBeLessThanOrEqual(SCR17_MAX_PAGES);
  });
}
