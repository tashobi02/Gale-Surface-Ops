import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { cellIndex, decodeSlopeDeg, type LoadedGrid } from "../src/grid.js";
import { samplePoint } from "../src/sampling.js";
import { searchLeg } from "../src/route.js";
import { handleWorkerMessage } from "../src/handler.js";
import type { ComputePlanRequest, MissionScenario } from "@marswalk/protocol";
import { F5_PATH, REAL_MANIFEST_PATH, REAL_SITE_DIR, ROOT, hasRealBundle, loadSiteGrid, machineLine, mulberry32, percentile } from "./fixtures/realSite.js";

const MOCK_SITE_DIR = path.join(ROOT, "data/sites/mock_site");

interface F5Cell {
  row: number;
  col: number;
  x_m: number;
  y_m: number;
  elevation_m: number;
  slope_p90_u8: number;
  slope_p90_deg: number;
}

function validateF5Records(records: unknown): F5Cell[] {
  if (!Array.isArray(records) || records.length !== 10) {
    throw new Error("Invalid F5: expected exactly ten cell records");
  }
  for (const record of records) {
    if (!record || typeof record !== "object" ||
      ![record.x_m, record.y_m, record.elevation_m, record.slope_p90_deg, record.slope_p90_u8].every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )) {
      throw new Error("Invalid F5: each cell needs finite coordinates, elevation and slope");
    }
  }
  return records as F5Cell[];
}

const readF5 = (): F5Cell[] => validateF5Records((JSON.parse(fs.readFileSync(F5_PATH, "utf8")) as { cells: unknown }).cells);
const hasSampleCells = fs.existsSync(F5_PATH);

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

const REAL_GRID_PAIRS_TIMEOUT_MS = 60_000;

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

    expect(res.type).toBe("PLAN_RESULT");
    if (res.type === "PLAN_RESULT") {
      expect(res.legs.length).toBe(4); // 3 stops + return leg
      expect(["OK", "PARTIAL", "OVER_LIMITS"]).toContain(res.status);
    }
    expect(duration).toBeLessThanOrEqual(2000);
  });
});

// Step 1: skip, with the reason printed, when data/sites/gale_boxwork/grid/ is absent (clean clone, CI)
if (!hasRealBundle) console.log("realGrid: real-grid checks skipped, data/sites/gale_boxwork/grid/ is absent");

it.skipIf(!hasSampleCells)("F5 contains exactly ten usable independent cell records", () => {
  expect(readF5()).toHaveLength(10);
});

describe.skipIf(!hasRealBundle || !hasSampleCells)("T05.28 — Verify on the real grid (gale_boxwork)", () => {
  it("FR-03: the ten F5 cells equal the decoded grid exactly (elevation to the float32 bit, slope P90 to the u8 step)", () => {
    const grid = loadSiteGrid(REAL_SITE_DIR);
    for (const cell of readF5()) {
      const index = cellIndex(grid, cell.x_m, cell.y_m);
      expect(index, `cell (${cell.row}, ${cell.col}) inside the grid`).toBe(cell.row * grid.meta.width + cell.col);
      expect(grid.elevation[index!]).toBe(Math.fround(cell.elevation_m));
      expect(grid.slopeP90[index!]).toBe(cell.slope_p90_u8);
      expect(decodeSlopeDeg(grid.slopeP90[index!]!)).toBe(cell.slope_p90_deg);
      const pt = samplePoint(grid, cell.x_m, cell.y_m, 50, 25);
      expect(pt.elevation_m).toBe(Math.fround(cell.elevation_m));
      expect(pt.slope_p90_deg).toBe(cell.slope_p90_deg);
    }
  });

  it("FR-07 / 01 §B: 20 scripted pairs inside AOI from the seeded generator, p50 and p95 recorded with the BD-03 machine line", () => {
    const grid = loadSiteGrid(REAL_SITE_DIR);
    const results = runSeededPairsBenchmark(grid, 20);

    expect(results.count).toBe(20);
    expect(results.failures).toBe(0);
    expect(results.routes + results.noRoutes).toBe(20);
    console.log(
      `T05.28 real-grid pairs (gale_boxwork): ${results.routes} routes, ${results.noRoutes} no-route; ` +
        `min ${results.min_ms.toFixed(0)} p50 ${results.p50_ms.toFixed(0)} p95 ${results.p95_ms.toFixed(0)} max ${results.max_ms.toFixed(0)} ms; machine: ${machineLine()}`,
    );
  }, REAL_GRID_PAIRS_TIMEOUT_MS);

  it("NFR-02: a 3-stop loop through the handler, repeated 5 times after one warm-up, has its worst run at most 2 s", () => {
    const grid = loadSiteGrid(REAL_SITE_DIR);
    const manifest = JSON.parse(fs.readFileSync(REAL_MANIFEST_PATH, "utf8"));
    expect(Number.isFinite(manifest.default_start?.x_m)).toBe(true);
    expect(Number.isFinite(manifest.default_start?.y_m)).toBe(true);
    expect(typeof manifest.data_version).toBe("string");
    expect(manifest.data_version).not.toBe("");
    const startX = manifest.default_start.x_m;
    const startY = manifest.default_start.y_m;

    const req: ComputePlanRequest = {
      type: "COMPUTE_PLAN",
      request_id: "bench-real-3stop-loop",
      plan_revision: 1,
      site_id: "gale_boxwork",
      data_version: manifest.data_version,
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

    handleWorkerMessage(grid, req); // warm-up (JIT)
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const res = handleWorkerMessage(grid, req);
      runs.push(performance.now() - t0);
      expect(res.type).toBe("PLAN_RESULT");
    }
    const sorted = [...runs].sort((a, b) => a - b);
    console.log(
      `T05.28 real-grid 3-stop loop (${manifest.data_version}): runs ${runs.map((v) => v.toFixed(0)).join(" ")} ms, p95 ${percentile(sorted, 0.95).toFixed(0)} ms; machine: ${machineLine()}`,
    );
    expect(sorted[sorted.length - 1]).toBeLessThanOrEqual(2000);
  }, REAL_GRID_PAIRS_TIMEOUT_MS);
});
