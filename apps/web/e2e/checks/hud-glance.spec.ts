/** T24.08/T24.10: five glance groups in every HUD state, read-only, 7:1. */
import { expect, test } from "@playwright/test";
import { expectContrast } from "../lib/contrast";
import { openSurfaceFixture, surfaceSnapshot } from "../lib/surfaceFixture";

for (const state of ["nominal", "caution", "warning", "no-link"] as const) {
  test(`hud-glance: ${state}, five values, 56 px, top 60 %, 7:1, no controls`, async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    const snapshot = surfaceSnapshot(state === "no-link" ? "no-hab-link" : state === "nominal" ? "walking" : "alerting");
    if (state === "caution") snapshot.alerts = snapshot.alerts.map((a) => ({ ...a, level: "caution", message: "Return to link" }));
    const fixture = await openSurfaceFixture(page, "hud", snapshot);
    try {
      const values = page.locator("[data-hud-value]");
      expect(await values.count()).toBe(state === "nominal" || state === "no-link" ? 4 : 5);
      const fonts = await values.evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
      for (const px of fonts) expect(px).toBeGreaterThanOrEqual(56);
      for (const name of ["haven", "o2", "next"]) {
        const box = (await page.locator(`[data-hud-value="${name}"]`).boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(390 * 0.6);
      }
      await expect(page.locator('[data-hud-value="o2"]')).toHaveText(String(Math.round(snapshot.crew[0]!.o2_frac * 100)));
      if (state === "caution" || state === "warning") {
        await expect(page.locator('[data-hud-value="alert"]')).toHaveText(snapshot.alerts[0]!.message);
        expect(await page.locator('[data-hud-value="alert"]').evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
      }
      if (state === "no-link") await expect(page.locator('[data-slot="hud-link"]')).toContainText("STALE");
      await expectContrast(page, { text: 7, large: 7, hud: 7 });
      await expect(page.locator("button, a, input, select, [role=button], [tabindex]:not([tabindex='-1'])")).toHaveCount(0);
    } finally { fixture.dispose(); }
  });
}
