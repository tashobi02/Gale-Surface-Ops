/**
 * Check `replay` (replaces the T27.06 replay part). Enabled by package 29.
 * `#/replay` served from a static folder with no Hab Core: the recorded log plays to the end and the report hash equals the
 * recorded one (N-21). Serving the built app from a plain static server is package 29's job; this body assumes it exports a
 * `STATIC_REPLAY_ORIGIN`.
 */
import { expect, test } from "@playwright/test";

test.fixme("replay: needs N-81 — complete recording plays to the end and its hash matches", async ({ page }) => {
  const origin = process.env.STATIC_REPLAY_ORIGIN;
  test.skip(!origin, "no static replay origin");
  await page.goto(`${origin}/#/replay`);
  await expect(page.locator("[data-replay-state]")).toHaveAttribute("data-replay-state", "ended", { timeout: 120_000 });
  const hash = await page.locator("[data-log-hash]").innerText();
  const recorded = await page.locator("[data-recorded-log-hash]").innerText();
  expect(hash).toBe(recorded);
});
