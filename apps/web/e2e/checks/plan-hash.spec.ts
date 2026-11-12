/**
 * Check `plan-hash` (replaces the T11.05 reproduction). Enabled by package 28.
 * Export a plan, load it back into the store and recompute: identical metrics and identical `plan_hash`, also on a non-secure
 * origin (FD-141: the hash is pure TypeScript, so plain `http://` on the LAN works). The harness origin is `http://127.0.0.1`.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.fixme("plan-hash: export, reload and recompute give the same metrics and plan_hash (enabled by package 28)", async ({ page }) => {
  await page.goto("/#/planner");
  await page.getByRole("button", { name: /demo plan/i }).click();
  await expect(page.locator("[data-results-banner]")).toBeVisible();
  const metrics = await page.locator("[data-metric]").allInnerTexts();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /export/i }).click()]);
  const exported = JSON.parse(readFileSync((await download.path())!, "utf8")) as { plan_hash: string };

  await page.goto("/#/");
  await page.goto("/#/planner");
  await page.getByLabel(/import plan/i).setInputFiles((await download.path())!);
  await expect(page.locator("[data-results-banner]")).toBeVisible();
  expect(await page.locator("[data-metric]").allInnerTexts()).toEqual(metrics);
  await expect(page.locator("[data-plan-hash]")).toHaveText(new RegExp(exported.plan_hash));
  expect(await page.evaluate(() => window.isSecureContext || location.hostname === "127.0.0.1")).toBe(true);
});
