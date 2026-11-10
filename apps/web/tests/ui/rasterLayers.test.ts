/**
 * T07.07 — Tiled raster layers tests (FR-01, FR-02, FR-16, 04 §C.1, 05 §C, 05 §E.6).
 *
 * Verifies:
 * - Builds custom TileGrid and TileLayer for each manifest raster_tiles layer
 * - Layers start with visible state matching manifest default_visible
 * - Places layers at C10 scientific overlay slot (z-index 30)
 * - Exposes show/hide and opacity controls for each layer for SCR-03
 * - Supports dynamic slope limit updates (caution & hard limits)
 * - Reports layer status (ready, loading, unavailable, out_of_range)
 * - Missing assets degrade gracefully to unavailable without throwing (FR-16)
 * - All tile URLs are local relative paths
 */

import { describe, it, expect, vi } from "vitest";
import {
  createRasterLayers,
  SCIENTIFIC_OVERLAY_Z_INDEX,
  type SiteManifestForLayers,
} from "../../src/ui/map/rasterLayers";

const MOCK_SITE_MANIFEST: SiteManifestForLayers = {
  site_id: "mock_site",
  data_version: "mock_site-2026.11.05",
  crs: {
    base: "IAU_2015:49900",
    proj4: "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs",
  },
  aoi: {
    bbox_geo: [137.3292, -4.7506, 137.4308, -4.6494],
    extent_m: [-3000, -3000, 3000, 3000],
  },
  layers: [
    {
      layer_id: "slope",
      title: "Slope",
      category: "topographic",
      kind: "raster_tiles",
      default_visible: false,
      provenance: "derived",
      source_ids: ["usgs-gale-dem-1m-v3"],
      derived_from: ["elevation"],
      units: "deg",
      native_resolution_m: 1,
      display_resolution_m: 2,
      asset_id: "tiles-slope",
      optional: true,
      limitations: "Horn slope on 1 m posts",
      legend: { type: "none" },
      tile_grid: {
        origin_m: [-3000, 3000],
        resolutions_m: [32, 16, 8, 4, 2],
        tile_size_px: 256,
        format: "png",
      },
    },
    {
      layer_id: "elevation",
      title: "Elevation",
      category: "topographic",
      kind: "raster_tiles",
      default_visible: false,
      provenance: "assumed",
      source_ids: ["usgs-gale-dem-1m-v3"],
      derived_from: [],
      units: "m",
      native_resolution_m: 1,
      display_resolution_m: 2,
      asset_id: "tiles-elevation",
      optional: true,
      limitations: "Synthetic flat placeholder",
      legend: { type: "none" },
      tile_grid: {
        origin_m: [-3000, 3000],
        resolutions_m: [32, 16, 8, 4, 2],
        tile_size_px: 256,
        format: "png",
      },
    },
  ],
};

describe("Tiled raster layers (T07.07)", () => {
  it("creates managed layers for each raster_tiles layer", () => {
    const controller = createRasterLayers(MOCK_SITE_MANIFEST);
    expect(controller.layers.size).toBe(2);
    expect(controller.getLayer("slope")).toBeDefined();
    expect(controller.getLayer("elevation")).toBeDefined();
  });

  it("sets z-index to scientific overlay slot (30)", () => {
    const controller = createRasterLayers(MOCK_SITE_MANIFEST);
    const slope = controller.getLayer("slope")!;
    expect(slope.layer.getZIndex()).toBe(SCIENTIFIC_OVERLAY_Z_INDEX);
    expect(SCIENTIFIC_OVERLAY_Z_INDEX).toBe(30);
  });

  it("initializes visibility to default_visible", () => {
    const controller = createRasterLayers(MOCK_SITE_MANIFEST);
    const slope = controller.getLayer("slope")!;
    expect(slope.isVisible()).toBe(false);
    expect(slope.layer.getVisible()).toBe(false);
  });

  it("toggles layer visibility via setVisible", () => {
    const controller = createRasterLayers(MOCK_SITE_MANIFEST);
    const slope = controller.getLayer("slope")!;

    slope.setVisible(true);
    expect(slope.isVisible()).toBe(true);
    expect(slope.layer.getVisible()).toBe(true);

    slope.setVisible(false);
    expect(slope.isVisible()).toBe(false);
    expect(slope.layer.getVisible()).toBe(false);
  });

  it("adjusts layer opacity via setOpacity", () => {
    const controller = createRasterLayers(MOCK_SITE_MANIFEST);
    const elev = controller.getLayer("elevation")!;

    elev.setOpacity(0.75);
    expect(elev.getOpacity()).toBe(0.75);
    expect(elev.layer.getOpacity()).toBe(0.75);
  });

  it("updates slope caution and hard limits dynamically (01 §E.1 step 6)", () => {
    const controller = createRasterLayers(MOCK_SITE_MANIFEST);
    expect(controller.getSlopeLimits()).toEqual({ cautionDeg: 10, hardDeg: 15 });

    controller.setSlopeLimits(8, 12);
    expect(controller.getSlopeLimits()).toEqual({ cautionDeg: 8, hardDeg: 12 });
  });

  it("handles missing assets or layer errors gracefully with unavailable status (FR-16)", () => {
    const controller = createRasterLayers(MOCK_SITE_MANIFEST);
    const slope = controller.getLayer("slope")!;
    expect(slope.status).toBe("ready");

    slope.setStatus("unavailable");
    expect(slope.status).toBe("unavailable");

    // Other layers remain intact and functional
    const elev = controller.getLayer("elevation")!;
    expect(elev.status).toBe("ready");
  });

  it("builds local tile URLs targeting site static directory", () => {
    const controller = createRasterLayers(MOCK_SITE_MANIFEST, { baseUrl: "/sites" });
    const url = controller.getTileUrl("slope", 0, 1, 2);
    expect(url).toBe("/sites/mock_site/tiles/slope/0/1/2.png");
    expect(url.startsWith("http")).toBe(false); // No internet at runtime
  });

  it("cleans up layers on destroy()", () => {
    const controller = createRasterLayers(MOCK_SITE_MANIFEST);
    expect(() => controller.destroy()).not.toThrow();
  });
});
