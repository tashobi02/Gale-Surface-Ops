import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import proj4 from "proj4";
import { get as getTransform } from "ol/proj/transforms.js";
import type { Layer, Site } from "@marswalk/protocol";
import {
  registerMarsProjection,
  createTileGrid,
  getMarsProjectionCode,
  projectedToLatLonE,
} from "../../src/ui/map/projection.js";

const REPO_ROOT = resolve(__dirname, "../../../..");
const MOCK_MANIFEST = join(REPO_ROOT, "data/sites/mock_site/site-manifest.json");
const PIPELINE_CONFIG = join(REPO_ROOT, "pipeline/src/marswalk_pipeline/config.py");

/** The F4 mock site manifest as the pipeline wrote it (T03.02); the same file the app fetches. */
const MOCK_SITE = JSON.parse(readFileSync(MOCK_MANIFEST, "utf8")) as Site;
const MARS_RADIUS_M = 3_396_190;

function rasterLayer(): Layer {
  const layer = MOCK_SITE.layers.find((l) => l.kind === "raster_tiles" && l.tile_grid);
  if (!layer?.tile_grid) throw new Error("mock site has no raster_tiles layer with a tile_grid");
  return layer;
}

/** The mock_site working projection as pipeline/config.py defines it (adjacent Python string literals joined). */
function pipelineProj4(siteId: string): string {
  const source = readFileSync(PIPELINE_CONFIG, "utf8");
  const entry = new RegExp(`"${siteId}":\\s*\\(((?:\\s*"[^"]*")+)\\s*\\)`).exec(source);
  if (!entry) throw new Error(`no PROJ4_BY_SITE entry for ${siteId} in config.py`);
  return [...entry[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
}

const FORBIDDEN = [
  "EPSG:3857",
  "EPSG:4326",
  "EPSG:900913",
  "ol/sphere",
  "ol/proj/epsg3857",
  "ol/proj/epsg4326",
] as const;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Forbidden Earth CRS codes and helpers in the executable part of a source file (comments are ignored). */
function findForbidden(source: string): string[] {
  const code = stripComments(source);
  return FORBIDDEN.filter((forbidden) => code.includes(forbidden));
}

function scan(dir: string, violations: { file: string; forbidden: string }[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      scan(full, violations);
    } else if (/\.(ts|tsx|js|jsx|html)$/.test(entry)) {
      for (const forbidden of findForbidden(readFileSync(full, "utf8"))) violations.push({ file: full, forbidden });
    }
  }
}

/** Great-circle distance on the Mars sphere (R = 3,396,190 m), never the Earth radius. */
function marsDistanceM(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const [lon1, lat1] = [a[0] * rad, a[1] * rad];
  const [lon2, lat2] = [b[0] * rad, b[1] * rad];
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.sqrt(h));
}

describe("Web CRS guard (02 §C.1, §C.4.2)", () => {
  it("forbids EPSG:3857, EPSG:4326 and ol/sphere in executable code under apps/web/src and apps/web/spike", () => {
    const violations: { file: string; forbidden: string }[] = [];
    scan(join(__dirname, "../../src"), violations);
    scan(join(__dirname, "../../spike"), violations);
    expect(violations, `Forbidden Earth CRS or helpers found: ${JSON.stringify(violations)}`).toEqual([]);
  });

  it("the guard itself detects each forbidden token in code and ignores comments", () => {
    for (const token of FORBIDDEN) {
      expect(findForbidden(`const crs = "${token}";`)).toEqual([token]);
      expect(findForbidden(`// ${token}\n/* ${token} */ const ok = 1;`)).toEqual([]);
    }
  });
});

describe("Mars projection module (T02.02, FR-01, D-03)", () => {
  it("registers the manifest proj4 string byte-for-byte, and it equals the pipeline's constant", () => {
    const manifestString = MOCK_SITE.crs.proj4;
    // The manifest is the pipeline's output: same string as config.py (05 §E.3).
    expect(manifestString).toBe(pipelineProj4(MOCK_SITE.site_id));

    // Record what is handed to proj4.defs without replacing its storage (the code -> definition table lives on the function).
    const original = proj4.defs;
    const calls: unknown[][] = [];
    const recorder = Object.assign((...args: unknown[]) => {
      calls.push(args);
      return (original as (...a: unknown[]) => unknown)(...args);
    }, original);
    (proj4 as unknown as { defs: unknown }).defs = recorder;
    try {
      registerMarsProjection(MOCK_SITE);
    } finally {
      (proj4 as unknown as { defs: unknown }).defs = original;
    }
    const code = getMarsProjectionCode(MOCK_SITE);
    const definitions = calls.filter((call) => call.length === 2);
    expect(definitions).toEqual([[code, manifestString]]);
  });

  it("uses a Mars-specific code derived from the site id and registers nothing else with proj4", () => {
    const before = new Set(Object.keys(proj4.defs));
    const proj = registerMarsProjection(MOCK_SITE);
    const code = getMarsProjectionCode(MOCK_SITE);

    expect(code).toBe(`MARS_LOCAL:${MOCK_SITE.site_id}`);
    expect(proj.getCode()).toBe(code);
    expect(proj.getUnits()).toBe("m");
    expect(proj.getMetersPerUnit()).toBe(1);
    expect(proj.getExtent()).toEqual(MOCK_SITE.aoi.extent_m);
    const added = Object.keys(proj4.defs).filter((key) => !before.has(key));
    expect(added.every((key) => key === code)).toBe(true);
    expect(Object.keys(proj4.defs)).toContain(code);
  });

  it("creates no transform path between the Mars projection and EPSG:4326 or EPSG:3857 (02 §C.1 Never)", () => {
    registerMarsProjection(MOCK_SITE);
    const code = getMarsProjectionCode(MOCK_SITE);
    for (const earth of ["EPSG:4326", "EPSG:3857"]) {
      expect(getTransform(code, earth), `${code} -> ${earth}`).toBeNull();
      expect(getTransform(earth, code), `${earth} -> ${code}`).toBeNull();
    }
  });

  it("uses projected metres for point resolution (identity), not an Earth-radius estimate", () => {
    const proj = registerMarsProjection(MOCK_SITE);
    const pointResolution = proj.getPointResolutionFunc();
    expect(pointResolution).toBeTypeOf("function");
    for (const [resolution, point] of [
      [2, [0, 0]],
      [16, [2900, 2900]],
      [32, [-2900, -2900]],
    ] as const) {
      expect(pointResolution!(resolution, [...point])).toBe(resolution);
    }
  });

  it("identity point resolution is justified: the projected scale stays within 1e-3 of 1 across the AOI", () => {
    registerMarsProjection(MOCK_SITE);
    const converter = proj4(getMarsProjectionCode(MOCK_SITE));
    const [minx, miny, maxx, maxy] = MOCK_SITE.aoi.extent_m;
    const step = 500;
    for (const [x, y] of [
      [minx, miny],
      [maxx - step, miny],
      [minx, maxy - step],
      [maxx - step, maxy - step],
    ]) {
      const east = marsDistanceM(converter.inverse([x, y]), converter.inverse([x + step, y])) / step;
      const north = marsDistanceM(converter.inverse([x, y]), converter.inverse([x, y + step])) / step;
      expect(Math.abs(east - 1)).toBeLessThan(1e-3);
      expect(Math.abs(north - 1)).toBeLessThan(1e-3);
    }
  });

  it("builds the OpenLayers TileGrid from the manifest tile_grid, not from constants", () => {
    const spec = rasterLayer().tile_grid!;
    const grid = createTileGrid(spec);
    expect(grid.getOrigin(0)).toEqual(spec.origin_m);
    expect(grid.getResolutions()).toEqual(spec.resolutions_m);
    expect(grid.getTileSize(0)).toBe(spec.tile_size_px);

    const custom = createTileGrid({ ...spec, origin_m: [-100, 100], resolutions_m: [8, 4], tile_size_px: 128 });
    expect(custom.getOrigin(0)).toEqual([-100, 100]);
    expect(custom.getResolutions()).toEqual([8, 4]);
    expect(custom.getTileSize(0)).toBe(128);
  });

  it("addresses tiles x eastward and y southward from origin_m[1], as pipeline tiles.py writes them (C9 v1.1)", () => {
    const spec = rasterLayer().tile_grid!;
    const grid = createTileGrid(spec);
    const [ox, oy] = spec.origin_m;
    spec.resolutions_m.forEach((resolution, z) => {
      const span = spec.tile_size_px * resolution;
      for (const x of [0, 1, 2]) {
        for (const y of [0, 1, 2]) {
          // tiles.py: left, top = ox + x * span, oy - y * span; window (left, top - span, left + span, top)
          expect(grid.getTileCoordExtent([z, x, y]), `z${z}/${x}/${y}`).toEqual([
            ox + x * span,
            oy - (y + 1) * span,
            ox + (x + 1) * span,
            oy - y * span,
          ]);
        }
      }
    });
    // The north-west corner is tile (x 0, y 0); moving south increases y.
    expect(grid.getTileCoordForCoordAndZ([ox + 1, oy - 1], 1)).toEqual([1, 0, 0]);
    const span1 = spec.tile_size_px * spec.resolutions_m[1];
    expect(grid.getTileCoordForCoordAndZ([ox + 1, oy - 1 - span1], 1)).toEqual([1, 0, 1]);
  });
});

describe("worldExtent and the inverse projection (T07.06 review; 02 §C.1)", () => {
  it("gives OpenLayers the world extent in degrees [min_lon_e, min_lat, max_lon_e, max_lat], not metres", () => {
    const proj = registerMarsProjection(MOCK_SITE);
    expect(proj.getWorldExtent()).toEqual(MOCK_SITE.aoi.bbox_geo);
    expect(proj.getExtent()).toEqual(MOCK_SITE.aoi.extent_m);
  });

  it("projectedToLatLonE inverts the manifest eqc string: the origin is (lat_0, lon_0) and metres map to degrees on the Mars sphere", () => {
    registerMarsProjection(MOCK_SITE);
    const read = (key: string): number => Number(new RegExp(`\\+${key}=(-?[\\d.]+)`).exec(MOCK_SITE.crs.proj4)![1]);
    const [latTs, lat0, lon0] = [read("lat_ts"), read("lat_0"), read("lon_0")];
    const deg = 180 / Math.PI;

    const origin = projectedToLatLonE(MOCK_SITE, 0, 0);
    expect(origin.lat).toBeCloseTo(lat0, 9);
    expect(origin.lon_e).toBeCloseTo(lon0, 9);

    // eqc: x = R (lon - lon_0) cos(lat_ts), y = R (lat - lat_0), R = Mars (never Earth's 6,371,008 m)
    for (const [x, y] of [[1000, 2000], [-1800, -1500], [2999, -2999]]) {
      const got = projectedToLatLonE(MOCK_SITE, x, y);
      expect(got.lat).toBeCloseTo(lat0 + (y / MARS_RADIUS_M) * deg, 9);
      expect(got.lon_e).toBeCloseTo(lon0 + (x / (MARS_RADIUS_M * Math.cos((latTs * Math.PI) / 180))) * deg, 9);
    }
  });

  it("returns east-positive longitude in [0, 360) and accepts a site id once registered", () => {
    registerMarsProjection(MOCK_SITE);
    const { lon_e } = projectedToLatLonE(MOCK_SITE.site_id, 0, 0);
    expect(lon_e).toBeGreaterThanOrEqual(0);
    expect(lon_e).toBeLessThan(360);
  });

  it("throws, never guesses a code path, for a site whose projection was not registered", () => {
    expect(() => projectedToLatLonE("never_registered_site", 0, 0)).toThrow(/not registered/);
  });
});
