/** T24.09: actual map viewport/view, safety geography, data layers and real OL touch zoom. */
import { expect, test } from "@playwright/test";
import { expectTargetSize, targets, boxes, expectSameBoxes } from "../lib/geometry";
import { openSurfaceFixture, surfaceSnapshot } from "../lib/surfaceFixture";

for (const viewport of [{ width: 844, height: 390 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
  test(`fullmap: safety geography, real layers, follow and pinch ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const fixture = await openSurfaceFixture(page, "eva");
    try {
      const safety = ["[data-slot=alert-slot]", "[data-slot=meta-strip]", "[data-slot=action-row]"];
      const original = await boxes(page, safety);
      await page.getByRole("button", { name: "Open full-screen map" }).click();
      const map = page.locator("[data-fullmap]");
      await expect(map).toHaveAttribute("data-map-status", "ready");
      await expect(page.locator('[data-fullmap] .ol-viewport canvas').first()).toBeVisible();
      expectSameBoxes(original, await boxes(page, safety), 0.5);
      const landscape = viewport.width > viewport.height;
      const area = page.locator('[data-fullmap] [data-slot="map-canvas"]');
      const box = (await area.boundingBox())!;
      if (landscape) expect(box.width).toBeGreaterThanOrEqual(viewport.width * 0.8);
      const valueSelector = landscape ? "[data-fullmap-value]" : '[data-slot="telemetry-row"] .value';
      const values = page.locator(valueSelector);
      expect(await values.count()).toBe(2);
      const minimum = landscape ? (viewport.width >= 1024 ? 48 : 40) : (viewport.width >= 768 ? 64 : 56);
      for (const value of await values.all()) {
        expect(await value.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(minimum);
        expect(await value.evaluate((el) => {
          const b = el.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return top === el || el.contains(top);
        })).toBe(true);
      }
      // Both safety values remain the largest numbers actually visible, excluding occluded tablet cards.
      const largest = await map.locator('[data-source]').evaluateAll((els) => Math.max(0, ...els.filter((el) => /\d/.test(el.textContent ?? "")).map((el) => parseFloat(getComputedStyle(el).fontSize))));
      if (landscape) for (const value of await values.all()) expect(await value.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(largest);
      const controls = await targets(page, "[data-fullmap-controls]");
      expect(controls).toHaveLength(6); expectTargetSize(controls, 56);
      const actualView = page.locator('[data-fullmap] [data-slot="ol-map"]');
      const own = fixture.snapshot.crew[0]!;
      await expect(actualView).toHaveAttribute("data-map-center", `${own.x_m},${own.y_m}`);
      fixture.send({ ...fixture.snapshot, crew: fixture.snapshot.crew.map((c) => c.crew_id === "EV1" ? { ...c, x_m: c.x_m + 1 } : c) });
      await expect(actualView).toHaveAttribute("data-map-center", `${own.x_m + 1},${own.y_m}`);
      await page.locator('#map-ctrl-follow').click();
      const center = await actualView.getAttribute("data-map-center");
      fixture.send({ ...fixture.snapshot, crew: fixture.snapshot.crew.map((c) => c.crew_id === "EV1" ? { ...c, x_m: c.x_m + 2 } : c) });
      await expect(actualView).toHaveAttribute("data-map-center", center!);
      const before = Number(await actualView.getAttribute("data-map-zoom"));
      expect(Number.isFinite(before)).toBe(true);
      const client = await page.context().newCDPSession(page);
      try {
        const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x - 20, y: c.y, id: 1 }, { x: c.x + 20, y: c.y, id: 2 }] });
        // OpenLayers establishes its distance on the first move, then applies the scale on later moves.
        for (const dx of [25, 40, 60, 80]) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: c.x - dx, y: c.y, id: 1 }, { x: c.x + dx, y: c.y, id: 2 }] });
        await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await expect.poll(async () => Number(await actualView.getAttribute("data-map-zoom"))).toBeGreaterThan(before);
      } finally { await client.detach(); }
      await page.locator('#map-ctrl-layers').click();
      // This case runs on the WS fixture snapshot, whose data version is not the one the Hab Core serves the hab
      // time field under. The client must refuse the field rather than draw another site's isochrones: the band
      // stays unavailable and says so with its own class and path (no invented bands, no number).
      const served = await page.request.get("/api/hab-time-field");
      expect(served.ok()).toBe(true);
      expect(served.headers()["x-data-version"]).not.toBe(fixture.snapshot.session.data_version);
      const havenBands = page.locator('[data-layer="haven_bands"]');
      await expect(havenBands).toBeDisabled();
      const havenBandsStatus = havenBands.locator("[data-source]");
      await expect(havenBandsStatus).toHaveText("— unavailable");
      await expect(havenBandsStatus).toHaveAttribute("data-provenance", "modelled");
      await expect(havenBandsStatus).toHaveAttribute("data-unavailable", "true");
      await expect(havenBandsStatus).toHaveAttribute("data-source", "unavailable:site.layer.haven_bands");
      for (const layer of ["slope", "comm_shadow"] as const) await expect(page.locator(`[data-layer="${layer}"]`)).toBeEnabled();
      await expect(page.locator('[data-layer="thermal_inertia"]')).toBeDisabled();
      await expect(page.locator('[data-layer="thermal_inertia"]')).toContainText("— unavailable");
      await page.locator('[data-layer="comm_shadow"]').click();
      await expect(page.locator('[data-fullmap]')).toContainText("LAYER: Comm shadow");
      // A new warning closes the map even while its layer menu is open; safety values/actions stay reachable.
      fixture.send(surfaceSnapshot("alerting-with-options"));
      await expect(map).toBeHidden();
      await expect(page.locator('[data-screen="SCR-14"]')).toBeVisible();
      expectSameBoxes(original, await boxes(page, safety), 0.5);
    } finally { fixture.dispose(); }
  });
}


test("haven bands use the supplied hab time field (N-120 closed)", async ({ page }) => {
  // Use the same session and data version as the binary endpoint, not an unrelated WS fixture.
  const response = await page.request.get("/api/session");
  expect(response.ok()).toBe(true);
  const snapshot = await response.json();
  const fixture = await openSurfaceFixture(page, "eva", snapshot);
  try {
    await page.getByRole("button", { name: "Open full-screen map" }).click();
    await page.locator('[data-fullmap][data-map-status="ready"]').waitFor();
    await page.locator('#map-ctrl-layers').click();
    const havenBands = page.locator('[data-layer="haven_bands"]');
    await expect(havenBands).toBeEnabled();
    // The field arrives from the Hab Core with its own class and source; the client draws the bands it was given
    // and never computes a time itself.
    const status = havenBands.locator("[data-source]");
    await expect(status).toHaveAttribute("data-provenance", "modelled");
    await expect(status).toHaveAttribute("data-source", "api:hab-time-field");
    await expect(status).not.toHaveAttribute("data-unavailable", "true");
    await havenBands.click();
    await expect(page.locator('[data-fullmap]')).toContainText("LAYER: Haven bands");
  } finally { fixture.dispose(); }
});
