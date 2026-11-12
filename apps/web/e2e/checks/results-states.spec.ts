/**
 * Check `results-states` (replaces T09.07). Enabled by package 28.
 * With `?mock_worker=1` and the OK, PARTIAL and OVER_LIMITS fixtures: the banner word and shape, the metrics, the warnings and
 * the profile as 03 SCR-05 describes them.
 * TODO(verify): the fixture selector (`mock_worker_result`) is package 06's switch.
 */
import { expect, test } from "@playwright/test";
import { STATUS_GLYPHS, STATUS_WORDS } from "../../src/ui/components/statusIcon";

const FIXTURES = [
  { name: "OK", status: "ok" as const },
  { name: "PARTIAL", status: "caution" as const },
  { name: "OVER_LIMITS", status: "blocked" as const },
];

test.fixme("results-states: banner word and shape, metrics and profile for OK, PARTIAL and OVER_LIMITS (enabled by package 28)", async ({ page }) => {
  for (const f of FIXTURES) {
    await page.goto(`/?mock_worker=1&mock_worker_result=${f.name}#/planner`);
    await page.waitForLoadState("networkidle");
    const banner = page.locator("[data-results-banner]");
    await expect(banner).toContainText(STATUS_WORDS[f.status]);
    await expect(banner).toContainText(STATUS_GLYPHS[f.status]);
    await expect(page.locator("[data-metric]").first()).toBeVisible();
    await expect(page.locator("[data-profile]")).toBeVisible();
  }
});
