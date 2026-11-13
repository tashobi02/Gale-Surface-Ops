/** T24.07: one common deadline for EVA and ops; cached data, real retry progress, actual restored snapshot. */
import { expect, test } from "@playwright/test";
import { HEARTBEAT_MS, LINK_LOST_AFTER_MS, type Snapshot } from "@marswalk/protocol";
import { killHab, restartHab } from "../lib/hab";

/**
 * The deadline runs from the LAST SERVER MESSAGE, not from the moment the Hab Core dies (FD-372, 02 §D.14: the server
 * sends PING every 2 s and the client shows "HAB LINK LOST" after 3 s without one). The last PING can be up to one
 * heartbeat before the kill, so the banner appears at most LINK_LOST_AFTER_MS + HEARTBEAT_MS after it.
 */
const DEADLINE_AFTER_KILL_MS = LINK_LOST_AFTER_MS + HEARTBEAT_MS;

test("link-lost: both roles show SCR-18 within 3 s of the last server message, actual retry counts, then restored values", async ({ context }) => {
  const eva = await context.newPage();
  const ops = await context.newPage();
  await ops.setViewportSize({ width: 1440, height: 900 });
  await eva.goto("/?site=mock_site#/eva/EV1");
  await ops.goto("/?site=mock_site#/ops");
  let killed = false;
  try {
    const before = await (await eva.request.get('/api/session')).json() as Snapshot;
    const member = before.crew.find((c) => c.crew_id === 'EV1')!;
    const o2 = String(Math.round(member.o2_frac * 100));
    await expect(eva.locator('[data-slot="o2"] .value')).toHaveText(o2);
    await expect(ops.getByTestId('clock-control')).toBeVisible();
    const clockButton = ops.getByTestId('clock-control').locator('button:not([disabled])').first();
    await clockButton.focus();
    await expect(clockButton).toBeFocused();
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
    await expect(ops.locator('[data-slot="live-screen"]')).toHaveAttribute('inert', '');
    await expect(ops.locator('[data-slot="link-lost-overlay"]')).toBeFocused();
    await ops.keyboard.press('Shift+Tab');
    await expect(ops.locator('[data-slot="link-lost-retry"]')).toBeFocused();
    await ops.keyboard.press('Tab');
    await expect(ops.locator('[data-slot="link-lost-overlay"]')).toBeFocused();
    await restartHab(); killed = false;
    const restored = await (await eva.request.get('/api/session')).json() as Snapshot;
    const expected = restored.crew.find((c) => c.crew_id === 'EV1')!;
    await Promise.all([eva, ops].map((page) => expect(page.locator('[data-screen="SCR-18"]')).toBeHidden({ timeout: 15_000 })));
    await expect(eva.locator('[data-slot="o2"] .value')).toHaveText(String(Math.round(expected.o2_frac * 100)));
    await expect(eva.locator('[data-slot="haven"] .value')).toHaveText(String(Math.round(expected.haven.minutes)));
    await expect(ops.locator('[data-testid="clock-control"]')).toBeVisible();
    await expect(clockButton).toBeFocused();
    await expect(ops.locator('[data-source="snapshot:crew.o2_frac"]').first()).toContainText(String(Math.round(expected.o2_frac * 100)));
  } finally {
    if (killed) await restartHab();
    await eva.close(); await ops.close();
  }
});

test("link-lost: SCR-18 does not appear before LINK_LOST_AFTER_MS, engages after it, and never drives simulated state", async ({ page }) => {
  let blockServer = false;
  let lastHeardAt = 0;
  let initialSnapshot: Snapshot | null = null;
  await page.routeWebSocket("**/ws", (ws) => {
    if (blockServer) {
      ws.close({ code: 1012, reason: "Harness: suppress reconnect during silence window" });
      return;
    }
    const server = ws.connectToServer();
    ws.onMessage((raw) => server.send(raw));
    server.onMessage((raw) => {
      if (blockServer) return;
      const msg = JSON.parse(String(raw)) as { type?: string };
      if (msg.type === "SNAPSHOT" && !initialSnapshot) initialSnapshot = msg as unknown as Snapshot;
      lastHeardAt = Date.now();
      ws.send(raw);
    });
  });

  await page.goto("/?site=mock_site#/eva/EV1");
  await expect(page.locator('[data-slot="o2"] .value')).not.toHaveText("—");
  expect(initialSnapshot).not.toBeNull();
  const initialO2 = String(Math.round(initialSnapshot!.crew.find((c) => c.crew_id === "EV1")!.o2_frac * 100));
  const initialHaven = String(Math.round(initialSnapshot!.crew.find((c) => c.crew_id === "EV1")!.haven.minutes));

  // Cut server silence cleanly right now and observe SCR-18 before LINK_LOST_AFTER_MS.
  blockServer = true;
  const silenceStart = lastHeardAt;
  await page.evaluate(() => {
    const win = window as unknown as { __scr18SeenAt?: number };
    const observer = new MutationObserver(() => {
      if (win.__scr18SeenAt === undefined && document.querySelector('[data-screen="SCR-18"]')) {
        win.__scr18SeenAt = Date.now();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Well before LINK_LOST_AFTER_MS (allow margin for last message timestamp), SCR-18 must NOT be shown yet.
  const preDeadlineRemaining = Math.max(200, silenceStart + LINK_LOST_AFTER_MS - 700 - Date.now());
  await page.waitForTimeout(preDeadlineRemaining);
  await expect(page.locator('[data-screen="SCR-18"]')).toHaveCount(0);
  // Simulated values remain untouched by the countdown timer.
  await expect(page.locator('[data-slot="o2"] .value')).toHaveText(initialO2);
  await expect(page.locator('[data-slot="haven"] .value')).toHaveText(initialHaven);

  // After LINK_LOST_AFTER_MS has elapsed from the last server message, SCR-18 appears and never drove simulated state.
  await expect(page.locator('[data-screen="SCR-18"] [role="alert"]')).toBeVisible({ timeout: LINK_LOST_AFTER_MS + 2000 });
  const seenAt = await page.evaluate(() => (window as unknown as { __scr18SeenAt?: number }).__scr18SeenAt ?? Date.now());
  expect(seenAt - silenceStart, "SCR-18 appeared before LINK_LOST_AFTER_MS").toBeGreaterThanOrEqual(LINK_LOST_AFTER_MS - 100);
  await expect(page.locator('[data-slot="cached-telemetry"] .value').nth(0)).toHaveText(initialHaven);
  await expect(page.locator('[data-slot="cached-telemetry"] .value').nth(1)).toHaveText(initialO2);
});
