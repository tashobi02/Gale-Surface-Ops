/**
 * Check `print` (replaces T11.05 and the page counts of T27.06). Enabled by packages 28 and 29.
 * SCR-08 is one page on A4 and on Letter for OK, Over limits and Partial; SCR-17 is at most two pages on A4 and on Letter, with
 * 12 mm margins. SCR-17 is printed populated (`/api/report` answered with a complete report of 3, 5 and 6 stops, up to 3
 * alerts and a crew trace; tests/fixtures/postEvaReport.ts) and with the page's own CSS `@page` margin, not one passed here.
 * TODO(verify): the SCR-08 fixture query (`mock_worker_result`) is package 06's switch.
 */
import { expect, test } from "@playwright/test";
import { pdfPages } from "../lib/print";
import { populatedReport } from "../../tests/fixtures/postEvaReport";

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
