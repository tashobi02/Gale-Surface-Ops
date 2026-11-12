import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FLAG_BITS } from "@marswalk/protocol";
import type { MissionScenario } from "@marswalk/protocol";
import { crewTimeField, habTimeField, vehiclePassable, vehicleTimeField, timeAt } from "../src/haven";
import type { TimeField } from "../src/haven";
import { rendezvous } from "../src/rendezvous";
import { RELAY_VIEWSHED_CELL_M, RELAY_VIEWSHED_RADIUS_M, viewshed } from "../src/viewshed";
import type { LoadedGrid } from "../src/grid";
import { defaultScenario, pr1Params } from "./fixtures/v2grids";
import { REAL_SITE_DIR, ROOT, cropGrid, hasRealBundle, loadSiteGrid, readManifest } from "./fixtures/realSite";

// T05b.20 (FR-39, FR-40, FR-42; 02 §D.8, §D.10, §D.11; BD-61): the haven, rendezvous and viewshed checked on the
// REAL gale_boxwork grid against independent references. Skipped, with the reason printed, when the bundle is absent.
if (!hasRealBundle) console.log("realGridVerify: skipped, data/sites/gale_boxwork/grid/ is absent (clean clone or no SSD)");

// ---------------------------------------------------------------------------
// Independent haven oracle: heap Dijkstra written from 02 §D.2 here, calling nothing in `src`.
// ---------------------------------------------------------------------------

const D2_CAUTION_MULT = 1.5; // 02 §D.2, Assumed ("configurable")
const D2_LOW_TI_MULT = 1.3;
const NO_DATA_BIT = 1 << FLAG_BITS.NO_DATA;
const HARD_BIT = 1 << FLAG_BITS.HARD_HAZARD;
const LOW_TI_BIT = 1 << FLAG_BITS.LOW_TI;

function blocked(g: LoadedGrid, sc: MissionScenario, k: number): boolean {
  return (
    (g.flags[k]! & (NO_DATA_BIT | HARD_BIT)) !== 0 ||
    g.slopeP90[k] === 255 ||
    g.slopeP90[k]! / 4 > sc.hard_slope_limit_deg ||
    Number.isNaN(g.elevation[k])
  );
}
function multiplier(g: LoadedGrid, sc: MissionScenario, k: number): number {
  return (g.slopeMax[k] !== 255 && g.slopeMax[k]! / 4 > sc.caution_slope_deg ? D2_CAUTION_MULT : 1) * ((g.flags[k]! & LOW_TI_BIT) !== 0 ? D2_LOW_TI_MULT : 1);
}
/** v(S) = v0 exp(-3.5 |S + 0.05|) / exp(-0.175); step = sqrt(d^2 + dz^2) / v(dz/d) * multiplier. */
function stepSeconds(sc: MissionScenario, d: number, dz: number, mult: number): number {
  const v0 = (sc.suited_flat_speed_kmh * 1000) / 3600;
  return (Math.sqrt(d * d + dz * dz) / ((v0 * Math.exp(-3.5 * Math.abs(dz / d + 0.05))) / Math.exp(-0.175))) * mult;
}

/** Heap Dijkstra. Forward: time from `start`. Reverse: time to walk TO `start` (the hab field). */
function oracleField(g: LoadedGrid, sc: MissionScenario, start: number, reverse: boolean): Float64Array {
  const { width: w, height: h, cell_m: c } = g.meta;
  const t = new Float64Array(w * h).fill(Infinity);
  const heap: [number, number][] = [[0, start]];
  t[start] = 0;
  const push = (item: [number, number]): void => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  while (heap.length > 0) {
    const [tu, u] = pop();
    if (tu > t[u]!) continue;
    const ui = Math.floor(u / w);
    const uj = u % w;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const ni = ui + di;
        const nj = uj + dj;
        if (ni < 0 || nj < 0 || ni >= h || nj >= w) continue;
        const nk = ni * w + nj;
        if (blocked(g, sc, nk)) continue;
        const d = c * (di !== 0 && dj !== 0 ? Math.SQRT2 : 1);
        const dz = reverse ? g.elevation[u]! - g.elevation[nk]! : g.elevation[nk]! - g.elevation[u]!;
        const cand = tu + stepSeconds(sc, d, dz, multiplier(g, sc, reverse ? u : nk));
        if (cand < t[nk]!) {
          t[nk] = cand;
          push([cand, nk]);
        }
      }
    }
  }
  return t;
}

function mismatches(a: Float64Array, b: Float64Array): number[] {
  const bad: number[] = [];
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k] && !(Math.abs(a[k]! - b[k]!) <= 1e-9 * Math.abs(b[k]!))) bad.push(k);
  return bad;
}

/** Every passable cell with both times finite is a candidate; sort by (max(Tc, Tv), Tc, index); take the first. */
function oracleRendezvous(crew: TimeField, vehicle: TimeField, passable: Uint8Array): { q: number; tc: number; tv: number } | null {
  const all: { q: number; tc: number; tv: number; key: number }[] = [];
  for (let q = 0; q < crew.seconds.length; q++) {
    if (passable[q] !== 1) continue;
    const x = crew.origin_m[0] + ((q % crew.width) + 0.5) * crew.cell_m;
    const y = crew.origin_m[1] - (Math.floor(q / crew.width) + 0.5) * crew.cell_m;
    const tc = crew.seconds[q]!;
    const tv = timeAt(vehicle, x, y);
    if (!Number.isFinite(tc) || !Number.isFinite(tv)) continue;
    all.push({ q, tc, tv, key: Math.max(tc, tv) });
  }
  all.sort((a, b) => a.key - b.key || a.tc - b.tc || a.q - b.q);
  return all[0] ?? null;
}

const CROP = 200;

function habCrop(grid: LoadedGrid): { crop: LoadedGrid; hab: { x_m: number; y_m: number }; habCell: number } {
  const manifest = readManifest();
  const mast = manifest.hab_candidates.find((c) => c.rank === 1)!.hab_mast;
  const col = Math.floor((mast.x_m - grid.meta.origin_m[0]) / grid.meta.cell_m);
  const row = Math.floor((grid.meta.origin_m[1] - mast.y_m) / grid.meta.cell_m);
  const crop = cropGrid(grid, row - CROP / 2, col - CROP / 2, CROP, CROP);
  return { crop, hab: { x_m: mast.x_m, y_m: mast.y_m }, habCell: (CROP / 2) * CROP + CROP / 2 };
}

describe.skipIf(!hasRealBundle)("T05b.20 haven and rendezvous on a 200 x 200 crop of the real grid (FR-39, FR-40)", () => {
  const grid = hasRealBundle ? loadSiteGrid(REAL_SITE_DIR) : (undefined as never);
  const sc = defaultScenario();

  it("the crop is the 200 x 200 window around the rank-1 hab and has terrain the oracle can disagree on", () => {
    const { crop } = habCrop(grid);
    expect(crop.meta.width).toBe(CROP);
    expect(crop.meta.height).toBe(CROP);
    let caution = 0;
    let blockedCells = 0;
    for (let k = 0; k < crop.elevation.length; k++) {
      if (crop.slopeMax[k] !== 255 && crop.slopeMax[k]! / 4 > sc.caution_slope_deg) caution++;
      if (blocked(crop, sc, k)) blockedCells++;
    }
    expect(caution + blockedCells).toBeGreaterThan(0);
  });

  it("habTimeField equals the independent heap Dijkstra at every cell", () => {
    const { crop, hab, habCell } = habCrop(grid);
    const field = habTimeField(crop, hab, sc);
    const ref = oracleField(crop, sc, habCell, true);
    const bad = mismatches(field.seconds, ref);
    expect(bad.length, `first mismatching cells ${bad.slice(0, 5).join(",")}`).toBe(0);
    expect(ref.filter(Number.isFinite).length).toBeGreaterThan(1000);
  });

  it("crewTimeField (unbounded) equals the independent forward Dijkstra from a crew cell 300 m east", () => {
    const { crop, hab } = habCrop(grid);
    const from = { x_m: hab.x_m + 300, y_m: hab.y_m };
    const col = Math.floor((from.x_m - crop.meta.origin_m[0]) / crop.meta.cell_m);
    const row = Math.floor((crop.meta.origin_m[1] - from.y_m) / crop.meta.cell_m);
    const field = crewTimeField(crop, from, sc, Infinity);
    const ref = oracleField(crop, sc, row * CROP + col, false);
    const bad = mismatches(field.seconds, ref);
    expect(bad.length, `first mismatching cells ${bad.slice(0, 5).join(",")}`).toBe(0);
  });

  it("rendezvous equals the brute-force candidate sort on the crop (vehicle from the hab, crew 300 m east)", () => {
    const { crop, hab } = habCrop(grid);
    const from = { x_m: hab.x_m + 300, y_m: hab.y_m + 100 };
    const crew = crewTimeField(crop, from, sc, sc.max_haven_min * 60);
    const vehicle = vehicleTimeField(crop, hab, pr1Params);
    const passable = vehiclePassable(crop, pr1Params);
    const want = oracleRendezvous(crew, vehicle, passable);
    const got = rendezvous(crew, vehicle, passable);
    expect(want).not.toBeNull();
    expect(got.status).toBe("OK");
    if (got.status !== "OK" || want === null) return;
    const wx = crew.origin_m[0] + ((want.q % crew.width) + 0.5) * crew.cell_m;
    const wy = crew.origin_m[1] - (Math.floor(want.q / crew.width) + 0.5) * crew.cell_m;
    expect([got.x_m, got.y_m]).toEqual([wx, wy]);
    expect(got.eta_crew_s).toBe(want.tc);
    expect(got.eta_vehicle_s).toBe(want.tv);
  });
});

// ---------------------------------------------------------------------------
// Viewshed against gdal_viewshed at five points (T03.30 method; -cc 1.0 is the sphere's curvature).
// ---------------------------------------------------------------------------

function pipelinePython(): string | null {
  try {
    const py = execFileSync("make", ["-s", "pipeline-python"], { cwd: ROOT, encoding: "utf8" }).trim();
    return fs.existsSync(path.join(path.dirname(py), "gdal_viewshed")) ? py : null;
  } catch {
    return null;
  }
}
const python = hasRealBundle ? pipelinePython() : null;
if (hasRealBundle && python === null) console.log("realGridVerify: gdal_viewshed check skipped, the pipeline environment or gdal_viewshed is absent");

describe.skipIf(!hasRealBundle || python === null)("T05b.20 viewshed vs gdal_viewshed at five points on the real grid (FR-42; BD-61)", () => {
  it("agrees with GDAL on at least 99 % of the 160,000 relay cells at each of the five points, and shows at most 0.5 % of cells that GDAL hides", () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "marswalk-gdalview-"));
    try {
      execFileSync(python!, [path.join(ROOT, "pipeline/tests/fixtures/gdal_viewshed_reference.py"), out], { cwd: ROOT, stdio: "pipe" });
      const ref = JSON.parse(fs.readFileSync(path.join(out, "reference.json"), "utf8")) as {
        mast_height_m: number;
        antenna_height_m: number;
        size: number;
        points: { label: string; x_m: number; y_m: number }[];
      };
      const grid = loadSiteGrid(REAL_SITE_DIR);
      expect(ref.points).toHaveLength(5);
      const report: string[] = [];
      ref.points.forEach((p, i) => {
        const gdal = fs.readFileSync(path.join(out, `view_${i}.u8`));
        const cov = viewshed(grid, { x_m: p.x_m, y_m: p.y_m, height_m: ref.mast_height_m }, ref.antenna_height_m, RELAY_VIEWSHED_RADIUS_M, RELAY_VIEWSHED_CELL_M);
        expect(cov.width).toBe(ref.size);
        let agree = 0;
        let extra = 0;
        let visible = 0;
        for (let k = 0; k < gdal.length; k++) {
          if (cov.visible[k] === gdal[k]) agree++;
          else if (cov.visible[k] === 1) extra++;
          visible += gdal[k]!;
        }
        const pct = (agree / gdal.length) * 100;
        report.push(`${p.label}: agree ${pct.toFixed(2)} %, compute-only ${(extra / gdal.length * 100).toFixed(2)} %, GDAL visible ${(visible / gdal.length * 100).toFixed(1)} %`);
        expect(pct, `${p.label}: ${report.at(-1)}`).toBeGreaterThanOrEqual(99);
        expect(extra / gdal.length, p.label).toBeLessThanOrEqual(0.005);
      });
      console.log(`T05b.20 viewshed vs gdal_viewshed (data_version ${readManifest().data_version}):\n  ${report.join("\n  ")}`);
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 300_000);
});
