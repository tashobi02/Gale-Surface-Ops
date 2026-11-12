/**
 * Check `walking-skeleton` (replaces T09.06). Enabled by package 28.
 * The demo plan on the real worker: every leg routed, the NFR-02 time from 02 §F met, and the result recorded for ADR-004.
 * The time limit is read from 02 §F by package 28; no number is written here.
 * TODO(verify): the recorded-result file for ADR-004 is package 28's.
 */
import { expect, test } from "@playwright/test";

test.fixme("walking-skeleton: the demo plan routes every leg within the NFR-02 time on the real worker (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/planner");
  await page.getByRole("button", { name: /demo plan/i }).click();
  const started = Date.now();
  await expect(page.locator("[data-results-banner]")).toBeVisible();
  const elapsedMs = Date.now() - started;
  const legs = await page.locator("[data-leg-status]").evaluateAll((els) => els.map((e) => e.getAttribute("data-leg-status")));
  expect(legs.length).toBeGreaterThan(0);
  expect(legs.every((s) => s === "routed")).toBe(true);
  test.info().annotations.push({ type: "nfr-02-elapsed-ms", description: String(elapsedMs) });
});
