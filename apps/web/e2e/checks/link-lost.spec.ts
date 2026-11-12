/**
 * Check `link-lost` (replaces T24.11 link-lost). Enabled by package 18.
 * Kill the Hab Core child: SCR-18 within 3 s on EVA and ops, cached values with their ages, the reconnect counter. Restart it
 * (`restartHab` resumes the latest session): the snapshot resumes.
 * TODO(verify): the SCR-18 selectors (`[data-cached-age]`, `[data-reconnect-count]`) are package 18's.
 */
import { expect, test } from "@playwright/test";
import { killHab, openRole, restartHab, waitForSnapshot } from "../lib/hab";

const LINK_LOST_WITHIN_MS = 3_000;

test.fixme("link-lost: SCR-18 within 3 s on EVA and ops, then the snapshot resumes (enabled by package 18)", async ({ context }) => {
  const eva = await openRole(context, "eva:EV1");
  const ops = await openRole(context, "ops");
  await waitForSnapshot(eva);
  await waitForSnapshot(ops);

  killHab();
  for (const page of [eva, ops]) {
    await expect(page.getByRole("alert").filter({ hasText: /link lost/i })).toBeVisible({ timeout: LINK_LOST_WITHIN_MS });
    await expect(page.locator("[data-cached-age]").first()).toBeVisible();
    await expect(page.locator("[data-reconnect-count]")).toBeVisible();
  }
  await restartHab();
  for (const page of [eva, ops]) {
    await expect(page.getByRole("alert").filter({ hasText: /link lost/i })).toBeHidden({ timeout: 15_000 });
    await waitForSnapshot(page);
  }
});
