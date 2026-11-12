/**
 * Check `queued-resend` (resolves the `habClient.ts` TODO(verify), FD-088). Enabled by package 18.
 * Drop the socket during a SUMMON hold and reconnect: exactly one `COMMAND_RESULT`, and the button showed
 * "Queued - sends when link returns" while the link was down.
 * TODO(verify): `context.setOffline` does not close an open WebSocket in Chromium; package 18 supplies a socket-drop hook.
 */
import { expect, test } from "@playwright/test";
import { waitForSnapshot } from "../lib/hab";

test.fixme("queued-resend: a SUMMON held while the link drops is sent exactly once on reconnect (enabled by package 18)", async ({ page }) => {
  const results: string[] = [];
  page.on("websocket", (ws) => ws.on("framereceived", (f) => typeof f.payload === "string" && f.payload.includes("COMMAND_RESULT") && results.push(f.payload)));
  await page.goto("/#/eva/EV1");
  await waitForSnapshot(page);
  const summon = page.getByRole("button", { name: /summon/i });
  await summon.hover();
  await page.mouse.down();
  await page.evaluate(() => (window as unknown as { __dropSocket?: () => void }).__dropSocket?.());
  await expect(summon).toContainText(/queued/i);
  await page.mouse.up();
  await expect.poll(() => results.length, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(2_000);
  expect(results).toHaveLength(1);
});
