import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSite, BootError } from "../../src/boot/loadSite";
import type { Site, POIFeature } from "@marswalk/protocol";

const mockSiteManifest: Site = {
  schema_version: "1.0.0",
  site_id: "mock_site",
  name: "Mock Site",
  body: "mars",
  data_version: "mock_site-2026.11.05",
  crs: {
    base: "IAU_2015:49900",
    proj4: "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs",
  },
  aoi: {
    extent_m: [-3000, -3000, 3000, 3000],
    bbox_geo: [137.3292, -4.7506, 137.4308, -4.6494],
  },
  default_start: { x_m: -1800, y_m: -1500, label: "Hab" },
  known_offsets_m: { traverse: null },
  grid: {
    cell_m: 5,
    width: 1200,
    height: 1200,
    origin_m: [-3000, 3000],
    row_order: "north_up",
    elevation_asset: "grid-elevation",
    slope_p90_asset: "grid-slope-p90",
    slope_max_asset: "grid-slope-max",
    flags_asset: "grid-flags",
    ti_asset: "grid-ti",
    ti_cell_m: 100,
    comm_hab_asset: "grid-comm-hab",
    hab_mast: { x_m: -1800, y_m: -1500, height_m: 20 },
  },
  layers: [
    {
      layer_id: "slope",
      title: "Slope",
      units: "deg",
      native_resolution_m: 1,
      display_resolution_m: 2,
      provenance: "derived",
      source_ids: ["dem-source"],
      category: "topographic",
      default_visible: true,
      kind: "raster_tiles",
      asset_id: "tiles-slope",
      limitations: "Horn slope",
      optional: false,
      legend: { type: "none" },
      tile_grid: {
        origin_m: [-3000, 3000],
        resolutions_m: [32, 16, 8, 4, 2],
        tile_size_px: 256,
        format: "png",
      },
    },
  ],
  sources: [
    {
      source_id: "dem-source",
      title: "USGS Gale DEM",
      publisher: "USGS",
      authors: "Parker et al.",
      missions: ["MSL"],
      instruments: ["HiRISE"],
      version: "v3",
      url: "https://example.com/dem",
      licence: "Public domain",
      accessed: "2026-11-01",
      credit: "USGS",
      accuracy_note: "1m",
    },
  ],
  assets: [
    {
      asset_id: "tiles-slope",
      path: "tiles/slope",
      format: "tiles",
      sha256: "abc123",
    },
    {
      asset_id: "vec-pois",
      path: "vectors/pois.geojson",
      format: "geojson",
      bytes: 500,
      sha256: "poi123",
    },
  ],
  pois_asset: "vec-pois",
  traverse_asset: "vec-traverse",
  env_constants: [],
};

const mockPoisGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-1000, 500] },
      properties: {
        poi_id: "poi-1",
        name: "Crater Rim",
        lat: -4.71,
        lon_e: 137.39,
        science_objective: "Examine layering",
        why_it_matters: "Aqueous history",
        provenance: "assumed",
        stop_type: "science",
      },
    },
  ],
};

describe("T07.02 Site Loading (loadSite)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads site manifest and POIs, building O(1) lookup maps", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("site-manifest.json")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockSiteManifest),
        } as Response);
      }
      if (url.endsWith("vectors/pois.geojson")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockPoisGeoJson),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);
    });

    const loaded = await loadSite("mock_site");

    expect(loaded.site.site_id).toBe("mock_site");
    expect(loaded.layers.get("slope")?.title).toBe("Slope");
    expect(loaded.sources.get("dem-source")?.publisher).toBe("USGS");
    expect(loaded.assets.get("tiles-slope")?.path).toBe("tiles/slope");
    expect(loaded.assets.get("tiles-slope")?.url).toBe("sites/mock_site/tiles/slope");
    expect(loaded.pois.get("poi-1")?.properties.name).toBe("Crater Rim");
  });

  it("raises BootError naming missing file when site-manifest.json is missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    await expect(loadSite("unknown_site")).rejects.toThrow(BootError);
    try {
      await loadSite("unknown_site");
    } catch (err) {
      expect(err).toBeInstanceOf(BootError);
      const bootErr = err as BootError;
      expect(bootErr.problem.missingFile).toBe("sites/unknown_site/site-manifest.json");
    }
  });

  it("raises BootError when POI asset fetch fails", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("site-manifest.json")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockSiteManifest),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);
    });

    await expect(loadSite("mock_site")).rejects.toThrow(BootError);
    try {
      await loadSite("mock_site");
    } catch (err) {
      expect(err).toBeInstanceOf(BootError);
      const bootErr = err as BootError;
      expect(bootErr.problem.missingFile).toContain("vectors/pois.geojson");
    }
  });
});
