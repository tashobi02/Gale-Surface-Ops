/**
 * Check `capture` (replaces T17.02 and T17.03 footage). Enabled by package 32.
 * Records the demo run to `var/videos/` through the browser context's `recordVideo`. Footage is git-ignored (FD-164).
 */
import { test } from "@playwright/test";
import { join } from "node:path";

const VIDEO_DIR = join(import.meta.dirname, "..", "..", "..", "..", "var", "videos");

test.fixme("capture: record the demo run to var/videos (enabled by package 32)", async ({ browser }) => {
  const context = await browser.newContext({ recordVideo: { dir: VIDEO_DIR } });
  const page = await context.newPage();
  await page.goto("/#/ops");
  // The scripted demo steps come from package 32's storyboard.
  await context.close();
});
