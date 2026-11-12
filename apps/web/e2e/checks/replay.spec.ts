/**
 * Check `replay` (replaces the T27.06 replay part). Enabled by package 29.
 * `#/replay` served from a static folder with no Hab Core: the recorded log plays to the end and the report hash equals the
 * recorded one (N-21). Serving the built app from a plain static server is package 29's job; this body assumes it exports a
 * `STATIC_REPLAY_ORIGIN`.
 *
 * Until N-81 commits the real recording, the read-only behaviour is checked on a fixture recording (lib/replayFixture.ts): the
 * ops view in the replay stays inspectable (event log drawer, panel drawers below 1280 px) at 1024, 1100, 1280 and 1440 px,
 * the playback speed and step controls work, and the hash badge reads verified (commands refused: tests/ui/replayRoute.test.ts).
 */
import { expect, test } from "@playwright/test";
import { openReplayFixture } from "../lib/replayFixture";

test.fixme("replay: needs N-81 — complete recording plays to the end and its hash matches", async ({ page }) => {
  const origin = process.env.STATIC_REPLAY_ORIGIN;
  test.skip(!origin, "no static replay origin");
  await page.goto(`${origin}/#/replay`);
  await expect(page.locator("[data-replay-state]")).toHaveAttribute("data-replay-state", "ended", { timeout: 120_000 });
  const hash = await page.locator("[data-log-hash]").innerText();
  const recorded = await page.locator("[data-recorded-log-hash]").innerText();
  expect(hash).toBe(recorded);
});

for (const width of [1024, 1100, 1280, 1440]) {
  test(`replay: read-only ops view stays inspectable at ${width} px (fixture recording)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const recording = await openReplayFixture(page);
    await expect(page.locator('[data-slot="replay-banner"]')).toHaveText(/REPLAYED RECORDING — read only/);
    await expect(page.locator("fieldset")).toHaveCount(0);
    await expect(page.locator('[data-slot="replay-hash"]')).toHaveAttribute("data-hash-status", "verified");
    await expect(page.locator("[data-log-hash]")).toHaveText(recording.log_hash);

    await page.locator('[data-slot="event-log-strip"]').click();
    await expect(page.locator('[data-slot="event-log-drawer"]')).toBeVisible();
    await page.locator('[data-slot="event-log-drawer-close"]').click();
    await expect(page.locator('[data-slot="event-log-drawer"]')).toHaveCount(0);

    if (width < 1280) {
      for (const name of ["Crew & vehicles", "Conditions & options"]) {
        const toggle = page.getByRole("button", { name });
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await toggle.click();
      }
    }

    await page.getByRole("button", { name: "Playback 10×" }).click();
    await expect(page.getByRole("button", { name: "Playback 10×" })).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-slot="replay-step"]').click();
    await expect(page.locator('[data-slot="replay-position"]')).toContainText(`2 of ${recording.messages.length}`);
  });
}
