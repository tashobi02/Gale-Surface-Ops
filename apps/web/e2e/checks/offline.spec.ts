/**
 * Check `offline` (replaces the T07.02/T07.03 Verify lines and the NFR-01 part of T14.09).
 * Every route of 03 §A, loaded on every project: zero blocked external requests, and fonts and icons come back from the
 * origin (FD-152). The route list is read from the router's one table, so a route a later package adds is covered at once.
 * Package 06 adds the planner boot on `?site=mock_site` (T07.02, T07.03 Verify) and SCR-00 for a site whose manifest was
 * deleted (T14.04): neither may contact anything but the Hab Core.
 */
import { expect, test } from "@playwright/test";
import { countResponses, expectLocalAssetsOk, expectNoExternal, guardNetwork, routeHashes } from "../lib/offline";
import { withManifestlessSite } from "../lib/siteBundle";

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

test("offline: the planner boots on ?site=mock_site and asks only the Hab Core for the manifest and the POIs", async ({ page }) => {
  const guard = await guardNetwork(page);
  await page.goto("/?site=mock_site#/planner");
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-slot="boot-failure"]')).toHaveCount(0);
  await expect(page.locator('[data-screen="SCR-02"]').first()).toBeVisible();
  const origin = new URL(page.url()).origin;
  const manifest = guard.responses.find((r) => r.url === `${origin}/sites/mock_site/site-manifest.json`);
  expect(manifest?.status, "manifest answered by the Hab Core").toBe(200);
  expect(guard.responses.some((r) => r.url.endsWith("/sites/mock_site/vectors/pois.geojson") && r.status === 200), "POIs answered").toBe(true);
  expectNoExternal(guard);
});

test("offline: SCR-00 names the deleted manifest, loads nothing external, and stays OPS", async ({ page }) => {
  await withManifestlessSite(async (siteId, manifestPath) => {
    const guard = await guardNetwork(page);
    await page.goto(`/?site=${siteId}#/planner`);
    await page.waitForLoadState("networkidle");
    const screen = page.locator('[data-screen="SCR-00"]');
    await expect(screen).toBeVisible();
    await expect(screen.locator('[data-slot="missing-file"]')).toHaveText(manifestPath);
    await expect(page.locator("html")).toHaveAttribute("data-mode", "ops");
    await expect(page.locator('[data-slot="boot-retry"]')).toBeVisible();
    expectNoExternal(guard);
    expectLocalAssetsOk(guard, ["font", "image"]);

    // Retry runs the boot again; the manifest is still missing, so SCR-00 stays and names the same file.
    await page.locator('[data-slot="boot-retry"]').click();
    await expect(screen.locator('[data-slot="missing-file"]')).toHaveText(manifestPath);
    expectNoExternal(guard);
  });
});
