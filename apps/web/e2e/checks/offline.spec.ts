/**
 * Check `offline` (replaces the T07.02/T07.03 Verify lines and the NFR-01 part of T14.09).
 * Every route of 03 §A, loaded on every project: zero blocked external requests, and fonts and icons come back from the
 * origin (FD-152). The route list is read from the router's one table, so a route a later package adds is covered at once.
 */
import { expect, test } from "@playwright/test";
import { countResponses, expectLocalAssetsOk, expectNoExternal, guardNetwork, routeHashes } from "../lib/offline";

test("offline: every route loads with no external request and local fonts and icons answer 2xx", async ({ page }) => {
  const guard = await guardNetwork(page);
  const hashes = routeHashes();
  expect(hashes.length).toBeGreaterThan(10);

  for (const hash of hashes) {
    const before = guard.blocked.length;
    // A fresh document each time, so an asset a route needs is requested again and not served from the previous route's page.
    await page.goto("about:blank");
    await page.goto(`/${hash}`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    expect(guard.blocked.slice(before), `external requests on ${hash}`).toEqual([]);
  }

  expectNoExternal(guard);
  expectLocalAssetsOk(guard, ["font", "image"]);
  // A font check that saw no font would pass for the wrong reason (FD-152).
  expect(countResponses(guard, "font"), "no font was loaded from the origin").toBeGreaterThan(0);
});
