/**
 * Check `eva-geometry` (replaces T24.04 fixed geography, UT-5, UT-6). Enabled by package 17.
 * At 844 x 390, 1024 x 768, 390 x 844 and 768 x 1024, and for Walking, At stop, Undo window, Ops-added task, Alerting, No hab
 * link and To haven: the alert slot, HAVEN, O2, strip and action row boxes are identical (within 0.5 px); the body fits with no
 * scroll; HAVEN is top-left; O2 sits immediately right of HAVEN on the same row.
 * TODO(verify): the state fixtures and the slot selectors (`[data-slot=...]`) are package 17's; the names here are the plan's words.
 */
import { expect, test } from "@playwright/test";
import { boxes, expectSameBoxes } from "../lib/geometry";
import { waitForSnapshot } from "../lib/hab";

const VIEWPORTS = [
  { width: 844, height: 390 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
];
const STATES = ["walking", "at-stop", "undo-window", "ops-added-task", "alerting", "no-hab-link", "to-haven"];
const SLOTS = ["[data-slot=alert]", "[data-slot=haven]", "[data-slot=o2]", "[data-slot=strip]", "[data-slot=actions]"];

test.fixme("eva-geometry: fixed geography in every state and viewport (enabled by package 17)", async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    let reference: Awaited<ReturnType<typeof boxes>> | null = null;
    for (const state of STATES) {
      await page.goto(`/#/eva/EV1?state=${state}`);
      await waitForSnapshot(page);
      const now = await boxes(page, SLOTS);
      reference ??= now;
      expectSameBoxes(reference, now, 0.5);
      const noScroll = await page.evaluate(() => document.body.scrollHeight <= window.innerHeight && document.body.scrollWidth <= window.innerWidth);
      expect(noScroll, `${viewport.width}x${viewport.height} ${state}: body scrolls`).toBe(true);
    }
    const haven = reference!["[data-slot=haven]"]!;
    const o2 = reference!["[data-slot=o2]"]!;
    expect(haven.x, "HAVEN is not left").toBeLessThan(o2.x);
    expect(Math.abs(haven.y - o2.y), "O2 is not on HAVEN's row").toBeLessThanOrEqual(0.5);
  }
});
