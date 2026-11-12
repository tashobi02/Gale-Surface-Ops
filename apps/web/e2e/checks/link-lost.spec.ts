/** T24.07: one common deadline for EVA and ops; cached data, real retry progress, actual restored snapshot. */
import { expect, test } from "@playwright/test";
import type { Snapshot } from "@marswalk/protocol";
import { killHab, openRole, restartHab } from "../lib/hab";

test("link-lost: both roles show SCR-18 within 3 s, actual retry counts, then restored values", async ({ context }) => {
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
    await Promise.all([eva, ops].map(async (page) => {
      await expect(page.locator('[data-screen="SCR-18"] [role="alert"]')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('[data-cached-age]')).toBeVisible();
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
