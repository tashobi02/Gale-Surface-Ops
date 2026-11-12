/**
 * Check `tiles-all-levels` (replaces T02.03 "renders at every level"; FD-104).
 * The spike page loads every `tile_grid` level of every raster layer in the manifest with HTTP 200 and paints a non-empty canvas.
 * The spike page takes `?site=<id>&layer=<layer_id>&zoom=<n>` (n indexes `resolutions_m`, so it is the tile z). It is built only
 * when `MARSWALK_SPIKE=1`, which globalSetup sets for the harness build; `make demo` does not ship it.
 */
import { expect, test } from "@playwright/test";

interface TileLayerMeta {
  layer_id: string;
  kind: string;
  tile_grid?: { resolutions_m: number[] };
}

test("tiles-all-levels: every tile_grid level loads 200 and paints", async ({ page, request }) => {
  const site = process.env.E2E_SITE ?? "mock_site";
  const manifest = (await (await request.get(`/sites/${site}/site-manifest.json`)).json()) as { layers: TileLayerMeta[] };
  const layers = manifest.layers.filter((l) => l.kind === "raster_tiles" && l.tile_grid);
  expect(layers.length).toBeGreaterThan(0);

  const seen = new Map<string, number[]>();
  page.on("response", (res) => {
    const m = /\/tiles\/([^/]+)\/(\d+)\/\d+\/\d+\./.exec(res.url());
    if (m) seen.set(`${m[1]}/${m[2]}`, [...(seen.get(`${m[1]}/${m[2]}`) ?? []), res.status()]);
  });

  for (const layer of layers) {
    const levels = layer.tile_grid!.resolutions_m.length;
    for (let z = 0; z < levels; z += 1) {
      await page.goto(`/spike/?site=${site}&layer=${layer.layer_id}&zoom=${z}`);
      await page.waitForLoadState("networkidle");
      const statuses = seen.get(`${layer.layer_id}/${z}`) ?? [];
      expect(statuses.length, `${layer.layer_id} level ${z}: no tile request`).toBeGreaterThan(0);
      expect(statuses.every((s) => s === 200), `${layer.layer_id} level ${z}: ${statuses.join(",")}`).toBe(true);
      const painted = await page.evaluate(() =>
        Array.from(document.querySelectorAll("canvas")).some((c) => {
          const ctx = c.getContext("2d");
          return !!ctx && c.width > 0 && ctx.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0);
        }),
      );
      expect(painted, `${layer.layer_id} level ${z}: canvas is empty`).toBe(true);
    }
  }
});
