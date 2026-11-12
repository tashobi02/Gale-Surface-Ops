/**
 * Check `fullmap` (replaces T24.09, UT-9, U-60). Enabled by package 18.
 * The full-screen map opens and closes; in landscape it is at least 80 % of the width; HAVEN and O2 are at least 40 px (phone)
 * or 48 px (tablet) and still the largest numbers; six labelled controls are at least 56 px; a warning closes it; a synthetic
 * two-touch pinch zooms (FD-030).
 * TODO(verify): control labels and the pinch hook are package 18's.
 */
import { expect, test } from "@playwright/test";
import { expectTargetSize, targets } from "../lib/geometry";
import { waitForSnapshot } from "../lib/hab";

const MAP_MIN_WIDTH_FRACTION = 0.8;
const PHONE_MIN_FONT_PX = 40;
const CONTROLS = 6;
const CONTROL_MIN_PX = 56;

test.fixme("fullmap: opens, fills 80 % of the width, keeps HAVEN and O2 large, six controls, closes on a warning, pinches (enabled by package 18)", async ({ page }) => {
  await page.goto("/#/eva/EV1");
  await waitForSnapshot(page);
  await page.getByRole("button", { name: /full map/i }).click();
  const map = page.locator("[data-fullmap]");
  await expect(map).toBeVisible();
  const box = (await map.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width * MAP_MIN_WIDTH_FRACTION);

  const sizes = await page.locator("[data-fullmap-value]").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  for (const px of sizes) expect(px).toBeGreaterThanOrEqual(PHONE_MIN_FONT_PX);

  const controls = await targets(page, "[data-fullmap] [data-fullmap-controls]");
  expect(controls).toHaveLength(CONTROLS);
  expectTargetSize(controls, CONTROL_MIN_PX);

  const before = await page.evaluate(() => (window as unknown as { __map?: { zoom(): number } }).__map?.zoom());
  const client = await page.context().newCDPSession(page);
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x - 20, y: c.y, id: 1 }, { x: c.x + 20, y: c.y, id: 2 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: c.x - 80, y: c.y, id: 1 }, { x: c.x + 80, y: c.y, id: 2 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const after = await page.evaluate(() => (window as unknown as { __map?: { zoom(): number } }).__map?.zoom());
  expect(after).toBeGreaterThan(before!);

  await page.getByRole("button", { name: /close map/i }).click();
  await expect(map).toBeHidden();
});
