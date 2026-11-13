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
import { routeFixtureRecording } from "../lib/replayFixture";

test("offline: every route loads with no external request and local fonts and icons answer 2xx", async ({ page }) => {
  const guard = await guardNetwork(page);
  const hashes = routeHashes();
  expect(hashes.length).toBeGreaterThan(10);

  for (const hash of hashes) {
    const before = guard.blocked.length;
    const seen = guard.responses.length;
    // A fresh document each time, so an asset a route needs is requested again and not served from the previous route's page.
    await page.goto("about:blank");
    // The replay plays a recording of the real scenario, whose map asks for the real site's tiles (git-ignored data that a checkout
    // may not have): serve the fixture recording, as the other checks do.
    if (hash === "#/replay") await routeFixtureRecording(page);
    await page.goto(`/?site=${process.env.E2E_SITE ?? "mock_site"}${hash}`);
    await page.waitForLoadState("networkidle");
    if (hash === "#/") await expect(page.locator('[data-screen="SCR-01"] h1')).toContainText("Plan the walk");
    if (hash === "#/sources") await expect(page.locator('[data-screen="SCR-09"] h1')).toContainText("What each value is");
    await page.evaluate(() => document.fonts.ready);
    expect(guard.blocked.slice(before), `external requests on ${hash}`).toEqual([]);
    // Name the route that asked its own origin for something that did not come back (a tile of a site other than ?site= means the
    // route ignored the query), instead of failing once at the end without saying which route it was.
    const failed = guard.responses.slice(seen).filter((r) => (r.type === "font" || r.type === "image") && r.status >= 400 && !r.url.includes("/api/join-qr?"));
    expect(failed.map((r) => `${r.status} ${r.url}`), `local font/image requests that failed on ${hash}`).toEqual([]);
  }

  expectNoExternal(guard);
  // The presenter's join QR images (N-16) do not exist in the Hab Core yet (N-90): they answer 404 and SCR-19 shows "—". The 2xx
  // requirement for them is the `needs N-90` test below; everything else must still answer.
  expectLocalAssetsOk({ ...guard, responses: guard.responses.filter((r) => !r.url.includes("/api/join-qr?")) }, ["font", "image"]);
  // A font check that saw no font would pass for the wrong reason (FD-152).
  expect(countResponses(guard, "font"), "no font was loaded from the origin").toBeGreaterThan(0);
});

test.fixme("needs N-90: every join QR image on the presenter panel answers 2xx", async ({ page }) => {
  const guard = await guardNetwork(page);
  await page.goto("/?site=mock_site#/presenter");
  await page.waitForLoadState("networkidle");
  const qr = guard.responses.filter((r) => r.url.includes("/api/join-qr?"));
  expect(qr.length, "the panel asked for no QR image").toBeGreaterThan(0);
  expect(qr.filter((r) => r.status >= 400)).toEqual([]);
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
  // Package 07 (BD-40): the boot sent the routing grid to the worker, and the real worker accepted it (the boot waits for
  // GRID_LOADED, so SCR-02 above is on screen only after it).
  for (const file of ["elevation.f32", "slope_p90.u8", "slope_max.u8", "flags.u8", "comm_hab.u8"]) {
    expect(guard.responses.some((r) => r.url.endsWith(`/sites/mock_site/grid/${file}`) && r.status === 200), `grid file ${file} answered`).toBe(true);
  }
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
