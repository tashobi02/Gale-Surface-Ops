/**
 * Check `rotation` (replaces UT-6). Enabled by package 17.
 * The same session rotated landscape and portrait in the middle of an alert: HAVEN stays the top-left card and O2 the card
 * right of it.
 * TODO(verify): `?state=alerting` and the `[data-slot]` selectors are package 17's.
 */
import { expect, test } from "@playwright/test";
import { boxes } from "../lib/geometry";
import { waitForSnapshot } from "../lib/hab";

test.fixme("rotation: HAVEN stays top-left and O2 right of it through a rotation mid-alert (enabled by package 17)", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/#/eva/EV1?state=alerting");
  await waitForSnapshot(page);
  for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    const b = await boxes(page, ["[data-slot=haven]", "[data-slot=o2]"]);
    const haven = b["[data-slot=haven]"]!;
    const o2 = b["[data-slot=o2]"]!;
    expect(haven.x).toBeLessThan(o2.x);
    expect(Math.abs(haven.y - o2.y)).toBeLessThanOrEqual(0.5);
    expect(haven.x).toBeLessThan(viewport.width / 2);
    expect(haven.y).toBeLessThan(viewport.height / 2);
  }
});
