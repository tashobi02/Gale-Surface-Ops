/**
 * Check `hud-glance` (replaces T24.11 glance, UT-1). Enabled by package 18.
 * `#/hud/EV1` in every state: at most 5 `[data-hud-value]` elements, each at least 56 px font; HAVEN, O2 and NEXT all inside the
 * top 60 % of the viewport; contrast at least 7 : 1; no control.
 * TODO(verify): the HUD states come from package 18's fixtures; until then this runs the default state only.
 */
import { expect, test } from "@playwright/test";
import { expectContrast } from "../lib/contrast";
import { waitForSnapshot } from "../lib/hab";

const MAX_VALUES = 5;
const MIN_FONT_PX = 56;
const TOP_FRACTION = 0.6;

test.fixme("hud-glance: five values, 56 px type, key values in the top 60 %, 7 : 1, no control (enabled by package 18)", async ({ page }) => {
  await page.goto("/#/hud/EV1");
  await waitForSnapshot(page);
  const values = page.locator("[data-hud-value]");
  expect(await values.count()).toBeLessThanOrEqual(MAX_VALUES);
  const fonts = await values.evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  for (const px of fonts) expect(px).toBeGreaterThanOrEqual(MIN_FONT_PX);

  const height = page.viewportSize()!.height;
  for (const name of ["haven", "o2", "next"]) {
    const box = await page.locator(`[data-hud-value="${name}"]`).boundingBox();
    expect(box, `HUD value ${name} is missing`).not.toBeNull();
    expect(box!.y + box!.height, `HUD value ${name} is below the top 60 %`).toBeLessThanOrEqual(height * TOP_FRACTION);
  }
  await expectContrast(page, { text: 7, large: 7, hud: 7 });
  expect(await page.locator("button, a, input, select, [role=button], [tabindex]").count(), "the HUD has a control").toBe(0);
});
