/**
 * Check `print` (replaces T11.05 and the page counts of T27.06). Enabled by packages 28 and 29.
 * SCR-08 is one page on A4 and on Letter for OK, Over limits and Partial; SCR-17 is at most two pages on A4 and on Letter, with
 * 12 mm margins.
 * TODO(verify): the SCR-08 fixture query (`mock_worker_result`) is package 06's switch.
 */
import { expect, test } from "@playwright/test";
import { pdfPages } from "../lib/print";

const FORMATS = ["A4", "Letter"] as const;
const SCR08_PAGES = 1;
const SCR17_MAX_PAGES = 2;

test.fixme("print: SCR-08 is one page on A4 and Letter for OK, Over limits and Partial (enabled by package 28)", async ({ page }) => {
  for (const fixture of ["OK", "OVER_LIMITS", "PARTIAL"]) {
    await page.goto(`/?mock_worker=1&mock_worker_result=${fixture}#/briefing`);
    await page.waitForLoadState("networkidle");
    for (const format of FORMATS) expect(await pdfPages(page, { format, margin: "12mm" }), `${fixture} ${format}`).toBe(SCR08_PAGES);
  }
});

test("print: SCR-17 is at most two pages on A4 and Letter", async ({ page }) => {
  await page.goto("/#/report");
  await page.waitForLoadState("networkidle");
  for (const format of FORMATS) expect(await pdfPages(page, { format, margin: "12mm" }), format).toBeLessThanOrEqual(SCR17_MAX_PAGES);
});
