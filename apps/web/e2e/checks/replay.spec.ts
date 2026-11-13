/**
 * Check `replay` (replaces the T27.06 replay part). Enabled by package 29.
 * `#/replay` served from a static folder with no Hab Core: the recorded log plays to the end and the report hash equals the
 * recorded one (N-21). The harness serves assets only: API/socket access is refused by the test.
 *
 * Until N-81 commits the real recording, the read-only behaviour is checked on a fixture recording (lib/replayFixture.ts): the
 * ops view in the replay stays inspectable (event log drawer, panel drawers below 1280 px) at 1024, 1100, 1280 and 1440 px,
 * the playback speed and step controls work, and the hash badge reads verified (commands refused: tests/ui/replayRoute.test.ts).
 */
import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalJson, type Recording } from "@marswalk/protocol";
import { openReplayFixture } from "../lib/replayFixture";

const recordingPath = new URL("../../../../scenarios/storm-sol4190/recording.json", import.meta.url);

test("replay: complete committed recording plays to ENDED without an API or socket and its hash matches", async ({ page }) => {
  test.setTimeout(180_000);
  const recording = JSON.parse(readFileSync(recordingPath, "utf8")) as Recording;
  const events = recording.messages.flatMap((m) => m.type === "EVENT" ? [m.event] : []);
  expect(events.length).toBeGreaterThan(0);
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  const independentHash = createHash("sha256").update(events.map((e) => `${canonicalJson(e)}\n`).join("")).digest("hex");
  expect(independentHash).toBe(recording.log_hash);
  expect(events.some((e) => e.kind === "EVA_ENDED")).toBe(true);
  const api: string[] = [];
  const sockets: string[] = [];
  await page.route("**/api/**", (route) => { api.push(route.request().url()); return route.abort(); });
  await page.routeWebSocket("**/ws", (socket) => { sockets.push(socket.url()); void socket.close(); });
  await page.route("**/replay/recording.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(recording) }));
  await page.clock.install();
  await page.goto("/?site=mock_site#/replay");
  await expect(page.locator('[data-slot="replay-hash"]')).toHaveAttribute("data-hash-status", "verified");
  await page.getByRole("button", { name: "Playback 60×", exact: true }).click();
  const first = Date.parse(recording.messages[0]!.sim_time);
  const last = Date.parse(recording.messages[recording.messages.length - 1]!.sim_time);
  await page.clock.runFor(Math.ceil((last - first) / 60) + 200);
  await expect(page.locator("[data-replay-state]")).toHaveAttribute("data-replay-state", "ended");
  await expect(page.locator('[data-slot="replay-ended"]')).toContainText("Session ended");
  await expect(page.locator('[data-slot="replay-position"]')).toContainText(`message ${recording.messages.length} of ${recording.messages.length}`);
  await expect(page.locator("[data-log-hash]")).toHaveText(independentHash);
  await expect(page.locator("[data-recorded-log-hash]")).toHaveText(recording.log_hash);
  // The end-state event log contains the whole ordered log, not merely its hash badge.
  await expect(page.locator(".event-row")).toHaveCount(events.length);
  expect(api, "replay must work with the Hab Core API absent").toEqual([]);
  expect(sockets, "replay must not connect a live role").toEqual([]);
  await expect(page).toHaveURL(/#\/replay/);
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
