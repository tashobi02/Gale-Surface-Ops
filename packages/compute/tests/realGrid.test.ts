import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { cellIndex, loadGrid, type LoadedGrid } from "../src/grid.js";
import { samplePoint } from "../src/sampling.js";
import { searchLeg } from "../src/route.js";
import { handleWorkerMessage } from "../src/handler.js";
import type { ComputePlanRequest, MissionScenario, RoutingGrid } from "@marswalk/protocol";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "../../..");
const REAL_SITE_DIR = path.join(ROOT, "data/sites/gale_boxwork");
const REAL_MANIFEST_PATH = path.join(REAL_SITE_DIR, "site-manifest.json");
const SAMPLE_CELLS_PATH = path.join(ROOT, "apps/web/tests/fixtures/real/sample_cells.json");
const MOCK_SITE_DIR = path.join(ROOT, "data/sites/mock_site");

const hasRealBundle =
  fs.existsSync(REAL_MANIFEST_PATH) &&
  fs.existsSync(path.join(REAL_SITE_DIR, "grid/elevation.f32"));

const hasSampleCells = fs.existsSync(SAMPLE_CELLS_PATH);

interface F5Cell {
  x_m: number;
  y_m: number;
  elevation_m: number;
  slope_deg: number;
}

function validateF5Records(records: unknown): F5Cell[] {
  if (!Array.isArray(records) || records.length !== 10) {
    throw new Error("Invalid F5: expected exactly ten cell records");
  }
  for (const record of records) {
    if (!record || typeof record !== "object" ||
      ![record.x_m, record.y_m, record.elevation_m, record.slope_deg].every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )) {
      throw new Error("Invalid F5: each cell needs finite coordinates, elevation and slope");
    }
  }
  return records as F5Cell[];
}

/** Seeded PRNG (Mulberry32) for reproducible benchmark point generation. */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Loads site grid arrays directly from a site directory using its site-manifest.json. */
function loadSiteGrid(siteDir: string): LoadedGrid {
  const manifest = JSON.parse(fs.readFileSync(path.join(siteDir, "site-manifest.json"), "utf8"));
  const gridMeta = manifest.grid as RoutingGrid;
  const assetMap = new Map<string, string>();
  for (const asset of manifest.assets ?? []) {
    assetMap.set(asset.asset_id, asset.path);
  }

  const elevPath = path.join(siteDir, assetMap.get(gridMeta.elevation_asset) ?? "grid/elevation.f32");
  const p90Path = path.join(siteDir, assetMap.get(gridMeta.slope_p90_asset) ?? "grid/slope_p90.u8");
  const maxPath = path.join(siteDir, assetMap.get(gridMeta.slope_max_asset) ?? "grid/slope_max.u8");
  const flagsPath = path.join(siteDir, assetMap.get(gridMeta.flags_asset) ?? "grid/flags.u8");

  const elevBuf = fs.readFileSync(elevPath);
  const p90Buf = fs.readFileSync(p90Path);
  const maxBuf = fs.readFileSync(maxPath);
  const flagsBuf = fs.readFileSync(flagsPath);

  let tiBuf: ArrayBuffer | undefined;
  const tiRel = assetMap.get(gridMeta.ti_asset ?? "") ?? "grid/ti_100m.f32";
  const tiPath = path.join(siteDir, tiRel);
  if (fs.existsSync(tiPath)) {
    const raw = fs.readFileSync(tiPath);
    tiBuf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  }

  let commBuf: ArrayBuffer | undefined;
  if (gridMeta.comm_hab_asset) {
    const commRel = assetMap.get(gridMeta.comm_hab_asset) ?? "grid/comm_hab.u8";
    const commPath = path.join(siteDir, commRel);
    if (fs.existsSync(commPath)) {
      const raw = fs.readFileSync(commPath);
      commBuf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    }
  }

  return loadGrid(
    gridMeta,
    {
      elevation: elevBuf.buffer.slice(elevBuf.byteOffset, elevBuf.byteOffset + elevBuf.byteLength),
      slopeP90: p90Buf.buffer.slice(p90Buf.byteOffset, p90Buf.byteOffset + p90Buf.byteLength),
      slopeMax: maxBuf.buffer.slice(maxBuf.byteOffset, maxBuf.byteOffset + maxBuf.byteLength),
      flags: flagsBuf.buffer.slice(flagsBuf.byteOffset, flagsBuf.byteOffset + flagsBuf.byteLength),
      ti: tiBuf,
      commHab: commBuf ?? new ArrayBuffer(gridMeta.width * gridMeta.height),
    },
  );
}

interface BenchmarkResults {
  count: number;
  p50_ms: number;
  p95_ms: number;
  min_ms: number;
  max_ms: number;
  failures: number;
  routes: number;
  noRoutes: number;
}

function runSeededPairsBenchmark(grid: LoadedGrid, pairCount = 20, seed = 20261108): BenchmarkResults {
  const rng = mulberry32(seed);
  const timings: number[] = [];
  let failures = 0;
  let routes = 0;
  let noRoutes = 0;

  const { width, height, cell_m, origin_m } = grid.meta;
  const [minX, minY, maxX, maxY] = [
    origin_m[0] + cell_m,
    origin_m[1] - height * cell_m + cell_m,
    origin_m[0] + width * cell_m - cell_m,
    origin_m[1] - cell_m,
  ];

  const scenario: MissionScenario = {
    eva_start_utc: "2026-11-13T08:00:00Z",
    max_eva_duration_h: 8,
    dwell_min_per_stop: 15,
    caution_slope_deg: 15,
    hard_slope_limit_deg: 25,
    walkback_limit_km: 10,
    suited_flat_speed_kmh: 3.3,
    crew_count: 2,
    solar_phase: "max",
    loop: false,
    max_haven_min: 30,
    vehicle_available: false,
  };

  for (let i = 0; i < pairCount; i++) {
    const startX = minX + rng() * (maxX - minX);
    const startY = minY + rng() * (maxY - minY);
    const endX = minX + rng() * (maxX - minX);
    const endY = minY + rng() * (maxY - minY);

    const t0 = performance.now();
    try {
      const result = searchLeg(
        grid,
        { x_m: startX, y_m: startY },
        { x_m: endX, y_m: endY },
        scenario,
      );
      const t1 = performance.now();
      timings.push(t1 - t0);

      if (result.status === "OK") {
        routes++;
      } else if (result.status === "NO_ROUTE") {
        noRoutes++;
      } else {
        failures++;
      }
    } catch {
      failures++;
    }
  }

  timings.sort((a, b) => a - b);
  const p50_ms = timings[Math.floor(timings.length * 0.5)] ?? 0;
  const p95_ms = timings[Math.floor(timings.length * 0.95)] ?? 0;
  const min_ms = timings[0] ?? 0;
  const max_ms = timings[timings.length - 1] ?? 0;

  return {
    count: pairCount,
    p50_ms,
    p95_ms,
    min_ms,
    max_ms,
    failures,
    routes,
    noRoutes,
  };
}

describe("T05.28 — Seeded benchmark runner on disk fixture (mock_site)", () => {
  it.each([
    { records: [] }, { records: {} }, { records: null },
    { records: [null] }, { records: Array.from({ length: 10 }, () => null) },
  ])("rejects malformed or empty F5 records $records", ({ records }) => {
    expect(() => validateF5Records(records)).toThrow(/^Invalid F5/);
  });

  it("executes 20 seeded pairs inside AOI with 0 crashes, 0 silent failures", () => {
    const grid = loadSiteGrid(MOCK_SITE_DIR);
    const results = runSeededPairsBenchmark(grid, 20);

    console.log(
      `[T05.28 benchmark mock_site] 20 pairs: p50=${results.p50_ms.toFixed(2)}ms, p95=${results.p95_ms.toFixed(2)}ms, min=${results.min_ms.toFixed(2)}ms, max=${results.max_ms.toFixed(2)}ms, routes=${results.routes}, noRoutes=${results.noRoutes}, failures=${results.failures}`,
    );

    expect(results.count).toBe(20);
    expect(results.failures).toBe(0);
    expect(results.routes + results.noRoutes).toBe(20);
    expect(results.p50_ms).toBeGreaterThanOrEqual(0);
    expect(results.p95_ms).toBeGreaterThanOrEqual(0);
  });

  it("runs a single timed 3-stop loop smoke check through the handler", () => {
    const grid = loadSiteGrid(MOCK_SITE_DIR);
    const req: ComputePlanRequest = {
      type: "COMPUTE_PLAN",
      request_id: "bench-3stop-loop",
      plan_revision: 1,
      site_id: "mock_site",
      data_version: "mock_site-2026.11.05",
      waypoints: [
        { id: "wp-start", role: "start", x_m: -1800, y_m: -1500 },
        { id: "wp-stop-1", role: "stop", x_m: 410, y_m: 325 },
        { id: "wp-stop-2", role: "stop", x_m: -500, y_m: 500 },
        { id: "wp-stop-3", role: "stop", x_m: -1000, y_m: -500 },
      ],
      scenario: {
        eva_start_utc: "2026-11-13T08:00:00Z",
        max_eva_duration_h: 8,
        dwell_min_per_stop: 15,
        caution_slope_deg: 15,
        hard_slope_limit_deg: 25,
        walkback_limit_km: 10,
        suited_flat_speed_kmh: 3.3,
        crew_count: 2,
        solar_phase: "max",
        loop: true,
        max_haven_min: 30,
        vehicle_available: false,
      },
    };

    const t0 = performance.now();
    const res = handleWorkerMessage(grid, req);
    const duration = performance.now() - t0;

    console.log(
      `[T05.28 benchmark mock_site] 3-stop loop duration=${duration.toFixed(2)}ms (legs=${res.type === "PLAN_RESULT" ? res.legs.length : "N/A"}, status=${res.type === "PLAN_RESULT" ? res.status : "ERROR"})`,
    );

    expect(res.type).toBe("PLAN_RESULT");
    if (res.type === "PLAN_RESULT") {
      expect(res.legs.length).toBe(4); // 3 stops + return leg
      expect(["OK", "PARTIAL", "OVER_LIMITS"]).toContain(res.status);
    }
    expect(duration).toBeLessThanOrEqual(2000);
  });
});

// TODO(verify): Obtain the gale_boxwork bundle and ten independent F5 cell records, resolve the F5 slope-raster choice with T03.21, and record real-grid pair timings plus repeated successful three-stop-loop p95 with machine, runtime and data_version. Mock-site and single-run timings do not establish this acceptance.
it.skipIf(!hasSampleCells)("F5 contains exactly ten usable independent cell records", () => {
  validateF5Records(JSON.parse(fs.readFileSync(SAMPLE_CELLS_PATH, "utf8")));
});

// Step 1: Skip real bundle verification when data/sites/gale_boxwork/ is absent (clean clone)
describe.skipIf(!hasRealBundle)("T05.28 — Verify on the real grid (gale_boxwork)", () => {
  it.skipIf(!hasSampleCells)("FR-03: compares 10 sampled F5 cells against rasterio readout", () => {
    const sampleCells = validateF5Records(JSON.parse(fs.readFileSync(SAMPLE_CELLS_PATH, "utf8")));
    const grid = loadSiteGrid(REAL_SITE_DIR);

    for (const cell of sampleCells) {
      const pt = samplePoint(grid, cell.x_m, cell.y_m, 50, 25);
      expect(pt.reason).toBeNull();
      const index = cellIndex(grid, cell.x_m, cell.y_m);
      expect(index).not.toBeNull();
      expect(grid.elevation[index!]).toBe(Math.fround(cell.elevation_m));
      const row = Math.floor(index! / grid.meta.width);
      const col = index! % grid.meta.width;
      const centerX = grid.meta.origin_m[0] + (col + 0.5) * grid.meta.cell_m;
      const centerY = grid.meta.origin_m[1] - (row + 0.5) * grid.meta.cell_m;
      const centerSample = samplePoint(grid, centerX, centerY, 50, 25);
      expect(centerSample.elevation_m).toBe(Math.fround(cell.elevation_m));
      expect(typeof pt.slope_p90_deg).toBe("number");
      expect(Math.abs(pt.slope_p90_deg! - cell.slope_deg)).toBeLessThanOrEqual(0.1);
    }
  });

  it("FR-07 / 01 §B: 20 scripted pairs inside AOI from seeded generator (p50/p95, 0 failures)", () => {
    const grid = loadSiteGrid(REAL_SITE_DIR);
    const results = runSeededPairsBenchmark(grid, 20);

    console.log(
      `[T05.28 benchmark gale_boxwork] 20 pairs: p50=${results.p50_ms.toFixed(2)}ms, p95=${results.p95_ms.toFixed(2)}ms, min=${results.min_ms.toFixed(2)}ms, max=${results.max_ms.toFixed(2)}ms, routes=${results.routes}, noRoutes=${results.noRoutes}, failures=${results.failures}`,
    );

    expect(results.count).toBe(20);
    expect(results.failures).toBe(0);
    expect(results.routes + results.noRoutes).toBe(20);
  });

  it("runs a single timed real-grid 3-stop loop smoke check through the handler", () => {
    const grid = loadSiteGrid(REAL_SITE_DIR);
    const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST_PATH, "utf8"));
    const startX = manifest.default_start?.x_m ?? 1037;
    const startY = manifest.default_start?.y_m ?? -1652;

    const req: ComputePlanRequest = {
      type: "COMPUTE_PLAN",
      request_id: "bench-real-3stop-loop",
      plan_revision: 1,
      site_id: "gale_boxwork",
      data_version: manifest.data_version ?? "gale_boxwork-2026.11.09",
      waypoints: [
        { id: "wp-start", role: "start", x_m: startX, y_m: startY },
        { id: "wp-stop-1", role: "stop", x_m: startX + 200, y_m: startY + 100 },
        { id: "wp-stop-2", role: "stop", x_m: startX + 100, y_m: startY + 300 },
        { id: "wp-stop-3", role: "stop", x_m: startX - 100, y_m: startY + 200 },
      ],
      scenario: {
        eva_start_utc: "2026-11-13T08:00:00Z",
        max_eva_duration_h: 8,
        dwell_min_per_stop: 15,
        caution_slope_deg: 15,
        hard_slope_limit_deg: 25,
        walkback_limit_km: 10,
        suited_flat_speed_kmh: 3.3,
        crew_count: 2,
        solar_phase: "max",
        loop: true,
        max_haven_min: 30,
        vehicle_available: false,
      },
    };

    const t0 = performance.now();
    const res = handleWorkerMessage(grid, req);
    const duration = performance.now() - t0;

    console.log(
      `[T05.28 benchmark gale_boxwork] 3-stop loop duration=${duration.toFixed(2)}ms (legs=${res.type === "PLAN_RESULT" ? res.legs.length : "N/A"}, status=${res.type === "PLAN_RESULT" ? res.status : "ERROR"})`,
    );

    expect(res.type).toBe("PLAN_RESULT");
    expect(duration).toBeLessThanOrEqual(2000);
  });
});
