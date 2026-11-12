/** T24.07: one common deadline for EVA and ops; cached data, real retry progress, actual restored snapshot. */
import { expect, test } from "@playwright/test";
import { HEARTBEAT_MS, LINK_LOST_AFTER_MS, type Snapshot } from "@marswalk/protocol";
import { killHab, openRole, restartHab } from "../lib/hab";

/**
 * The deadline runs from the LAST SERVER MESSAGE, not from the moment the Hab Core dies (FD-372, 02 §D.14: the server
 * sends PING every 2 s and the client shows "HAB LINK LOST" after 3 s without one). The last PING can be up to one
 * heartbeat before the kill, so the banner appears at most LINK_LOST_AFTER_MS + HEARTBEAT_MS after it.
 */
const DEADLINE_AFTER_KILL_MS = LINK_LOST_AFTER_MS + HEARTBEAT_MS;

test("link-lost: both roles show SCR-18 within 3 s of the last server message, actual retry counts, then restored values", async ({ context }) => {
  const eva = await openRole(context, "eva:EV1");
  const ops = await openRole(context, "ops");
  let killed = false;
  try {
    const before = await (await eva.request.get('/api/session')).json() as Snapshot;
    const member = before.crew.find((c) => c.crew_id === 'EV1')!;
    const o2 = String(Math.round(member.o2_frac * 100));
    await expect(eva.locator('[data-slot="o2"] .value')).toHaveText(o2);
    await expect(ops.getByTestId('clock-control')).toBeVisible();
    killHab(); killed = true;
    const killedAt = Date.now();
    await Promise.all([eva, ops].map(async (page) => {
      await expect(page.locator('[data-screen="SCR-18"] [role="alert"]')).toBeVisible({ timeout: DEADLINE_AFTER_KILL_MS + 2000 });
      // The age counts the seconds since the last server message, so it is the deadline the client really keeps: it never
      // passes LINK_LOST_AFTER_MS while the banner is up.
      const age = await page.locator('[data-cached-age]').first().textContent();
      expect(Number(age), 'the cached age in seconds').toBeLessThanOrEqual(LINK_LOST_AFTER_MS / 1000);
      expect(Date.now() - killedAt, 'the time from the kill to the banner').toBeLessThanOrEqual(DEADLINE_AFTER_KILL_MS);
      const count = page.locator('[data-reconnect-count]');
      await expect(count).toHaveText(/^\d+$/);
      const first = Number(await count.textContent());
      await expect.poll(async () => Number(await count.textContent()), { timeout: 2500 }).toBeGreaterThan(first);
    }));
    await expect(eva.locator('[data-slot="cached-telemetry"] .value').nth(1)).toHaveText(o2);
    await restartHab(); killed = false;
    const restored = await (await eva.request.get('/api/session')).json() as Snapshot;
    const expected = restored.crew.find((c) => c.crew_id === 'EV1')!;
    await Promise.all([eva, ops].map((page) => expect(page.locator('[data-screen="SCR-18"]')).toBeHidden({ timeout: 15_000 })));
    await expect(eva.locator('[data-slot="o2"] .value')).toHaveText(String(Math.round(expected.o2_frac * 100)));
    await expect(eva.locator('[data-slot="haven"] .value')).toHaveText(String(Math.round(expected.haven.minutes)));
    await expect(ops.locator('[data-testid="clock-control"]')).toBeVisible();
    await expect(ops.locator('[data-source="snapshot:crew.o2_frac"]').first()).toContainText(String(Math.round(expected.o2_frac * 100)));
  } finally {
    if (killed) await restartHab();
    await eva.close(); await ops.close();
  }
});
