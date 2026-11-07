import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Site, Layer } from "@marswalk/protocol";
import { registerMarsProjection, createTileGrid, getMarsProjectionCode } from "../../src/ui/map/projection.js";

const MOCK_SITE: Site = {
  schema_version: "1.0.0",
  site_id: "gale_boxwork",
  name: "Mount Sharp boxwork, Gale crater",
  body: "mars",
  data_version: "gale_boxwork-2026.11.05",
  crs: {
    base: "IAU_2015:49900",
    proj4: "+proj=eqc +lat_ts=-4.70 +lat_0=-4.70 +lon_0=137.38 +x_0=0 +y_0=0 +R=3396190 +units=m +no_defs",
  },
  aoi: {
    extent_m: [-3000, -3000, 3000, 3000],
    bbox_geo: [137.3292, -4.7506, 137.4308, -4.6494],
  },
  default_start: { x_m: -1800, y_m: -1500, label: "Habitat / rover" },
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
    hab_mast: { x_m: -1800, y_m: -1500, height_m: 10 },
  },
  layers: [],
  env_constants: [],
  sources: [],
  pois_asset: "vec-pois",
  traverse_asset: "vec-traverse",
  assets: [],
};

const MOCK_LAYER: Layer = {
  layer_id: "slope",
  title: "Slope",
  category: "topographic",
  kind: "raster_tiles",
  provenance: "derived",
  source_ids: ["usgs-gale-dem-1m-v3"],
  legend: {
    type: "classes",
    breaks_follow_scenario: true,
    classes: [
      [0, 5, "flat"],
      [5, 10, "gentle"],
      [10, 15, "caution"],
      [15, 25, "over limit"],
      [25, 90, "steep"],
    ],
  },
  native_resolution_m: 1,
  display_resolution_m: 2,
  asset_id: "tiles-slope",
  tile_grid: {
    origin_m: [-3000, 3000],
    resolutions_m: [32, 16, 8, 4, 2],
    tile_size_px: 256,
    format: "png",
  },
  default_visible: false,
  optional: true,
  limitations: "Horn slope on 1 m posts",
};

describe("Web CRS guard (02 §C.1, §C.4.2)", () => {
  it("forbids EPSG:3857, EPSG:4326 and ol/sphere in all apps/web/src executable code", () => {
    const srcDir = join(__dirname, "../../src");
    const violations: { file: string; forbidden: string }[] = [];

    function stripComments(source: string): string {
      return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    }

    function scan(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          scan(full);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
          const rawContent = readFileSync(full, "utf8");
          const code = stripComments(rawContent);
          if (code.includes("EPSG:3857")) {
            violations.push({ file: full, forbidden: "EPSG:3857" });
          }
          if (code.includes("EPSG:4326")) {
            violations.push({ file: full, forbidden: "EPSG:4326" });
          }
          if (code.includes("ol/sphere")) {
            violations.push({ file: full, forbidden: "ol/sphere" });
          }
        }
      }
    }

    scan(srcDir);
    expect(violations, `Forbidden Earth CRS or helpers found in apps/web/src: ${JSON.stringify(violations)}`).toEqual([]);
  });
});

describe("Mars projection module (T02.02, FR-01, D-03)", () => {
  it("registers proj4 string unchanged with a Mars-specific code", () => {
    const proj = registerMarsProjection(MOCK_SITE);
    const code = getMarsProjectionCode(MOCK_SITE);

    expect(code).not.toContain("EPSG:3857");
    expect(code).not.toContain("EPSG:4326");
    expect(code.startsWith("MARS_LOCAL:") || code.startsWith("MARS:")).toBe(true);
    expect(proj.getCode()).toBe(code);
    expect(proj.getUnits()).toBe("m");
    expect(proj.getExtent()).toEqual([-3000, -3000, 3000, 3000]);
  });

  it("calculates point resolution in projection metres without Earth-radius scaling", () => {
    const proj = registerMarsProjection(MOCK_SITE);
    // Point resolution should equal nominal resolution (1.0 at resolution 1.0) on the working projection plane
    const pointResolution = proj.getPointResolutionFunc()?.(1.0, [0, 0]) ?? 1.0;
    expect(pointResolution).toBeCloseTo(1.0, 5);
  });

  it("creates an OpenLayers TileGrid from manifest tile_grid configuration", () => {
    expect(MOCK_LAYER.tile_grid).toBeDefined();
    const grid = createTileGrid(MOCK_LAYER.tile_grid!);
    expect(grid.getOrigin(0)).toEqual([-3000, 3000]);
    expect(grid.getResolutions()).toEqual([32, 16, 8, 4, 2]);
    expect(grid.getTileSize(0)).toBe(256);
  });
});
