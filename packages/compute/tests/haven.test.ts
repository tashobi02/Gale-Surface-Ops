import { describe, expect, it } from "vitest";
import { FLAG_BITS } from "@marswalk/protocol";
import type { MissionScenario, ParamSet } from "@marswalk/protocol";
import {
  HAB_INGRESS_S,
  HAVEN_PLANNING_LABEL,
  HAVEN_PLANNING_RADIUS_M,
  HAVEN_SAMPLE_SPACING_M,
  VEHICLE_GRID_CELL_M,
  crewTimeField,
  habTimeField,
  havenAlongRoute,
  isCellPassable,
  liveHaven,
  pathTo,
  timeAt,
  toLeg,
  vehiclePassable,
  vehicleTimeField,
} from "../src";
import type { HavenIngress, LoadedGrid, TimeField } from "../src";
import {
  CREW_FROM_HAB_M,
  DETOUR_WALL_X_M,
  RIDGE_FLANK_CELLS,
  RIDGE_PLATEAU_HALF_CELLS,
  defaultScenario,
  fixtureCellCentre,
  flatGrid,
  havenFlat,
  havenSlowVehicle,
  havenWallDetour,
  pr1Params,
  rendezvousRidge,
} from "./fixtures/v2grids";
import type { XY } from "./fixtures/v2grids";

// docs/specs/02 §D.8 validation (FR-39), with the §D.2 suited step cost and the §D.9 vehicle cost. TASK-05b.
//
// Every expected value is derived here from the fixture's declared shape (v2grids.ts), `defaultScenario()`,
// `pr1Params` / `slowVehicleParams` and closed forms (octile distance on flat ground), or from a brute-force
// oracle written in this file. No result is typed in. The §D.2 Tobler formula is written out below as an
// independent oracle; the parity block at the end compares the fields with TASK-05's own v1 step cost
// (`toLeg`, `isCellPassable`: route.ts, leg.ts, timeModel.ts), so haven and the route search cannot drift apart.
// Fields are built lazily inside each test (`cached`), so a stub failure is reported by the test that hit it.

// ---------------------------------------------------------------------------
// Declared spec inputs (inputs, not results)
// ---------------------------------------------------------------------------

/** 02 §D.2 step-cost multipliers, labelled Assumed there ("configurable"). */
const D2_CAUTION_MULT = 1.5;
const D2_LOW_TI_MULT = 1.3;

const NO_DATA_BIT = 1 << FLAG_BITS.NO_DATA;
const HARD_BIT = 1 << FLAG_BITS.HARD_HAZARD;
const LOW_TI_BIT = 1 << FLAG_BITS.LOW_TI;

const scenario: MissionScenario = defaultScenario();
const v0 = (scenario.suited_flat_speed_kmh * 1000) / 3600; // m/s
const vvOf = (p: ParamSet): number => ((p.values.flat_speed_kmh as number) * 1000) / 3600; // m/s
const ingress: HavenIngress = { hab_s: HAB_INGRESS_S, vehicle_s: (pr1Params.values.ingress_min as number) * 60 };
const limitS = scenario.max_haven_min * 60;

// ---------------------------------------------------------------------------
// Helpers (no `src` call except through the functions under test)
// ---------------------------------------------------------------------------

const memo = new Map<string, unknown>();
/** Build once per file; never cache a throw, so every test reports its own failure. */
function cached<T>(key: string, make: () => T): T {
  if (!memo.has(key)) memo.set(key, make());
  return memo.get(key) as T;
}

interface Geo {
  cell_m: number;
  width: number;
  height: number;
  origin_m: [number, number];
}

/** 05 §E.1: i = floor((oy - y) / c), j = floor((x - ox) / c); null outside. */
function cellAt(g: Geo, x: number, y: number): number | null {
  const i = Math.floor((g.origin_m[1] - y) / g.cell_m);
  const j = Math.floor((x - g.origin_m[0]) / g.cell_m);
  if (!(i >= 0 && j >= 0 && i < g.height && j < g.width)) return null;
  return i * g.width + j;
}
function mustCell(g: Geo, p: XY): number {
  const k = cellAt(g, p.x_m, p.y_m);
  if (k === null) throw new Error(`test setup: (${p.x_m}, ${p.y_m}) is outside the grid`);
  return k;
}
const rowOf = (g: Geo, k: number): number => Math.floor(k / g.width);
const colOf = (g: Geo, k: number): number => k % g.width;
function centreOf(g: Geo, k: number): XY {
  return {
    x_m: g.origin_m[0] + (colOf(g, k) + 0.5) * g.cell_m + 0,
    y_m: g.origin_m[1] - (rowOf(g, k) + 0.5) * g.cell_m + 0,
  };
}
/** Octile distance in cells (8-connected, unit orthogonal step, sqrt 2 diagonal) between two cells of one lattice. */
function octileCells(g: Geo, a: number, b: number): number {
  const di = Math.abs(rowOf(g, a) - rowOf(g, b));
  const dj = Math.abs(colOf(g, a) - colOf(g, b));
  return Math.max(di, dj) + (Math.SQRT2 - 1) * Math.min(di, dj);
}
const dist = (a: XY, b: XY): number => Math.hypot(a.x_m - b.x_m, a.y_m - b.y_m);
const geoOf = (g: LoadedGrid): Geo => g.meta;

/** 02 §D.2 speed model, written out: v(S) = v0 * exp(-3.5 |S + 0.05|) / exp(-0.175). */
function toblerSpeed(S: number): number {
  return (v0 * Math.exp(-3.5 * Math.abs(S + 0.05))) / Math.exp(-0.175);
}
/** 02 §D.2 step cost: sqrt(d^2 + dz^2) / v(S) * m, with dz in the direction of travel. */
function refSuitedStep(d: number, dz: number, mult: number): number {
  return (Math.sqrt(d * d + dz * dz) / toblerSpeed(dz / d)) * mult;
}

/** Suited impassability, 02 §D.2 plus a NaN elevation, written independently of the implementation. */
function suitedBlocked(g: LoadedGrid, sc: MissionScenario, k: number): boolean {
  return (
    (g.flags[k]! & (NO_DATA_BIT | HARD_BIT)) !== 0 ||
    g.slopeP90[k] === 255 ||
    g.slopeP90[k]! / 4 > sc.hard_slope_limit_deg ||
    Number.isNaN(g.elevation[k])
  );
}
/** Multiplier of an entered cell. A slope_max of 255 (no data) counts as no caution, as v1 does (route.ts decodes it to null, then 0). */
function suitedMult(g: LoadedGrid, sc: MissionScenario, k: number): number {
  return (g.slopeMax[k] !== 255 && g.slopeMax[k]! / 4 > sc.caution_slope_deg ? D2_CAUTION_MULT : 1) * ((g.flags[k]! & LOW_TI_BIT) !== 0 ? D2_LOW_TI_MULT : 1);
}

/**
 * Brute-force suited Dijkstra, O(n^2), for small grids. Forward: crew-style field from `start`.
 * Reverse: time to walk from each cell TO `start`. The cost of a step is charged on the cell entered in the
 * direction of travel, as v1 does (route.ts searchLeg charges the destination cell; T05b.04 note in TASK-05b).
 */
function referenceField(g: LoadedGrid, sc: MissionScenario, start: number, reverse: boolean): Float64Array {
  const { width: w, height: h, cell_m: c } = g.meta;
  const n = w * h;
  const t = new Float64Array(n).fill(Infinity);
  const done = new Uint8Array(n);
  t[start] = 0;
  for (;;) {
    let u = -1;
    for (let k = 0; k < n; k++) if (!done[k] && Number.isFinite(t[k]!) && (u < 0 || t[k]! < t[u]!)) u = k;
    if (u < 0) break;
    done[u] = 1;
    const ui = Math.floor(u / w);
    const uj = u % w;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const ni = ui + di;
        const nj = uj + dj;
        if (ni < 0 || nj < 0 || ni >= h || nj >= w) continue;
        const nk = ni * w + nj;
        if (done[nk] || suitedBlocked(g, sc, nk)) continue;
        const d = c * (di !== 0 && dj !== 0 ? Math.SQRT2 : 1);
        const dz = reverse ? g.elevation[u]! - g.elevation[nk]! : g.elevation[nk]! - g.elevation[u]!;
        const mult = reverse ? suitedMult(g, sc, u) : suitedMult(g, sc, nk);
        const cand = t[u]! + refSuitedStep(d, dz, mult);
        if (cand < t[nk]!) t[nk] = cand;
      }
    }
  }
  return t;
}

/** Small non-flat grid: sinusoidal terrain, a caution strip, a LOW_TI strip and a hazard block. */
function bumpyGrid(): LoadedGrid {
  const g = flatGrid({ cell_m: 5, cellsWest: 20, cellsEast: 20, cellsNorth: 20, cellsSouth: 20 });
  const { width: w, height: h } = g.meta;
  for (let k = 0; k < w * h; k++) {
    const p = fixtureCellCentre(g.meta, k);
    g.elevation[k] = 3 * Math.sin(p.x_m / 20) * Math.cos(p.y_m / 25) + 0.01 * p.x_m;
    g.slopeP90[k] = 40; // 10 deg, passable, not above the caution slope
    g.slopeMax[k] = 40;
  }
  for (let i = 5; i <= 15; i++) for (let j = 8; j <= 9; j++) g.slopeMax[i * w + j] = 48; // 12 deg > caution
  for (let i = 25; i <= 33; i++) for (let j = 12; j <= 14; j++) g.flags[i * w + j]! |= LOW_TI_BIT;
  for (let i = 12; i <= 14; i++) for (let j = 22; j <= 30; j++) g.flags[i * w + j]! |= HARD_BIT;
  g.slopeP90[7 * w + 30] = 61; // 15.25 deg: above the 15 deg hard limit
  return g;
}

/** Set a field of cells to a flag, by projected-metre box (inclusive of cell centres inside [x0, x1) x [y0, y1)). */
function markBox(g: LoadedGrid, box: { x0: number; x1: number; y0: number; y1: number }, bit: number): void {
  for (let k = 0; k < g.meta.width * g.meta.height; k++) {
    const p = fixtureCellCentre(g.meta, k);
    if (p.x_m >= box.x0 && p.x_m < box.x1 && p.y_m >= box.y0 && p.y_m < box.y1) g.flags[k]! |= bit;
  }
}

/** Hand-built field for the small liveHaven / timeAt / pathTo cases: one row, cell 5 m, centres at x = 2.5, 7.5, ... */
function manual(seconds: number[], prev: number[]): TimeField {
  return { cell_m: 5, width: seconds.length, height: 1, origin_m: [0, 2.5], seconds: Float64Array.from(seconds), prev: Int32Array.from(prev) };
}

function expectNoMismatch(bad: number[], label: string): void {
  expect(bad.length, `${label}: first mismatching cells ${bad.slice(0, 5).join(",")}`).toBe(0);
}

// Cached cases ---------------------------------------------------------------

function flatCase() {
  return cached("flat", () => {
    const fx = havenFlat();
    return {
      fx,
      grid: fx.grid,
      shape: fx.shape,
      hab: habTimeField(fx.grid, fx.shape.hab, scenario),
      crew: crewTimeField(fx.grid, fx.shape.crew, scenario, limitS),
      veh: vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params),
      pass: vehiclePassable(fx.grid, pr1Params),
    };
  });
}
function slowCase() {
  return cached("slow", () => {
    const fx = havenSlowVehicle();
    return {
      fx,
      params: fx.params,
      veh: vehicleTimeField(fx.grid, fx.shape.vehicle, fx.params),
      pass: vehiclePassable(fx.grid, fx.params),
    };
  });
}
function wallCase() {
  return cached("wall", () => {
    const fx = havenWallDetour();
    return {
      fx,
      grid: fx.grid,
      shape: fx.shape,
      hab: habTimeField(fx.grid, fx.shape.hab, scenario),
      crew: crewTimeField(fx.grid, fx.shape.crew, scenario, limitS),
      veh: vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params),
      pass: vehiclePassable(fx.grid, pr1Params),
    };
  });
}
/** Closed form of the wall-case walking time between hab and crew (see the wall test for the argument). */
function wallDetourSeconds(): number {
  const { fx } = wallCase();
  const c = fx.grid.meta.cell_m;
  const { hab, crew, wall, detourCorners } = fx.shape;
  const r = Math.abs(detourCorners[0].y_m) / c;
  const dxHab = (wall.x_m - hab.x_m) / c;
  const dxCrew = (crew.x_m - wall.x_m) / c;
  const octile = (a: number, b: number) => Math.max(a, b) + (Math.SQRT2 - 1) * Math.min(a, b);
  return ((octile(dxHab, r) + octile(dxCrew, r)) * c) / v0;
}

// ---------------------------------------------------------------------------
// habTimeField: T_hab, reverse Dijkstra (02 §D.8)
// ---------------------------------------------------------------------------

describe("habTimeField (T_hab, reverse Dijkstra)", () => {
  it("flat: T_hab(crew) = crewToHab_m / v0, the 02 §D.8 hand value", () => {
    const { hab, shape } = flatCase();
    expect(timeAt(hab, shape.crew.x_m, shape.crew.y_m)).toBeCloseTo(shape.crewToHab_m / v0, 6);
  });

  it("flat: 1 km takes 18.18 min, the 02 §D.3 test case", () => {
    const { hab, shape } = flatCase();
    // The literals 1000 and 18.18 are the spec's own hand case, quoted from 02 §D.3 ("Test cases: 1 km flat -> 18.18
    // min", v0 = 3.3 km/h). They are not computed here, so this test also catches a change of the fixture or of v0.
    expect(shape.crewToHab_m).toBe(1000);
    expect(timeAt(hab, shape.crew.x_m, shape.crew.y_m) / 60).toBeCloseTo(18.18, 2);
  });

  it("flat: T_hab at the corners, a 45 degree diagonal and the vehicle is the octile distance over v0", () => {
    const { hab, grid, shape } = flatCase();
    const g = geoOf(grid);
    const habCell = mustCell(g, shape.hab);
    const probes: XY[] = [
      { x_m: g.origin_m[0] + 1, y_m: g.origin_m[1] - 1 },
      { x_m: g.origin_m[0] + g.width * g.cell_m - 1, y_m: g.origin_m[1] - 1 },
      { x_m: g.origin_m[0] + 1, y_m: g.origin_m[1] - g.height * g.cell_m + 1 },
      { x_m: g.origin_m[0] + g.width * g.cell_m - 1, y_m: g.origin_m[1] - g.height * g.cell_m + 1 },
      { x_m: 300, y_m: 300 },
      shape.vehicle,
    ];
    for (const p of probes) {
      const k = mustCell(g, p);
      expect(hab.seconds[k], `probe (${p.x_m}, ${p.y_m})`).toBeCloseTo((octileCells(g, k, habCell) * g.cell_m) / v0, 6);
    }
  });

  it("the hab cell has seconds 0 and prev -1; the field has the grid's geometry", () => {
    const { hab, grid, shape } = flatCase();
    const k = mustCell(geoOf(grid), shape.hab);
    expect(hab.seconds[k]).toBe(0);
    expect(hab.prev[k]).toBe(-1);
    expect(hab.cell_m).toBe(grid.meta.cell_m);
    expect([hab.width, hab.height]).toEqual([grid.meta.width, grid.meta.height]);
    expect(hab.origin_m).toEqual(grid.meta.origin_m);
    expect(hab.seconds.length).toBe(grid.meta.width * grid.meta.height);
    expect(hab.prev.length).toBe(grid.meta.width * grid.meta.height);
  });

  it("back-pointers: every reached cell points to an 8-neighbour that is nearer to the hab by one step", () => {
    const { hab, grid, shape } = flatCase();
    const g = geoOf(grid);
    const start = mustCell(g, shape.hab);
    const stepOrth = g.cell_m / v0;
    const bad: number[] = [];
    for (let k = 0; k < hab.seconds.length; k++) {
      if (k === start) continue;
      const p = hab.prev[k]!;
      if (p < 0) {
        bad.push(k);
        continue;
      }
      const di = Math.abs(rowOf(g, k) - rowOf(g, p));
      const dj = Math.abs(colOf(g, k) - colOf(g, p));
      const diff = hab.seconds[k]! - hab.seconds[p]!;
      const step = di === 1 && dj === 1 ? stepOrth * Math.SQRT2 : stepOrth;
      if (Math.max(di, dj) !== 1 || Math.abs(diff - step) > 1e-9) bad.push(k);
    }
    expectNoMismatch(bad, "prev");
  });

  it("wall detour: T_hab(crew) = 2 * octile(wall column, corner row) * cell / v0", () => {
    // Why this is exact: a path between hab and crew visits the wall column (8-connected steps move one column at
    // a time) at |row offset| >= r (the wall fills rows -r+1 .. r-1 around the hab row), and the octile cost of a
    // leg is strictly increasing in |row offset|, so the cheapest crossing is at the corner.
    const { hab, shape } = wallCase();
    expect(timeAt(hab, shape.crew.x_m, shape.crew.y_m)).toBeCloseTo(wallDetourSeconds(), 6);
    expect(wallDetourSeconds()).toBeGreaterThan(shape.crewToHab_m / v0);
  });

  it("wall detour: the path to the hab passes through one of the detour corners and no wall cell", () => {
    const { hab, grid, shape } = wallCase();
    const g = geoOf(grid);
    const path = pathTo(hab, shape.crew.x_m, shape.crew.y_m);
    expect(path.length).toBeGreaterThan(2);
    const corners = shape.detourCorners.map((c) => mustCell(g, c));
    const cells = path.map(([x, y]) => mustCell(g, { x_m: x, y_m: y }));
    // The corner is the cheapest crossing, but another cell at the same row offset is not equally cheap, so the path
    // crosses the wall column exactly at a corner cell (which of the two is tie-break dependent).
    expect(cells.some((k) => corners.includes(k))).toBe(true);
    for (const k of cells) expect(grid.flags[k]! & HARD_BIT).toBe(0);
  });

  it("wall cells are Infinity with prev -1", () => {
    const { hab, grid, shape } = wallCase();
    const g = geoOf(grid);
    let walls = 0;
    for (let k = 0; k < grid.flags.length; k++) {
      if ((grid.flags[k]! & HARD_BIT) === 0) continue;
      walls++;
      expect(hab.seconds[k]).toBe(Infinity);
      expect(hab.prev[k]).toBe(-1);
    }
    expect(walls).toBe(((shape.wall.yMax_m - shape.wall.yMin_m) / g.cell_m) + 1);
  });

  it("an enclosed pocket is Infinity with prev -1 and the rest is finite", () => {
    const fx = havenFlat();
    const g = geoOf(fx.grid);
    const centre = mustCell(g, { x_m: -1000, y_m: 300 });
    const ring = new Set<number>();
    const inside = new Set<number>();
    for (let di = -2; di <= 2; di++) {
      for (let dj = -2; dj <= 2; dj++) {
        const k = (rowOf(g, centre) + di) * g.width + colOf(g, centre) + dj;
        (Math.max(Math.abs(di), Math.abs(dj)) === 2 ? ring : inside).add(k);
        if (Math.max(Math.abs(di), Math.abs(dj)) === 2) fx.grid.flags[k]! |= HARD_BIT;
      }
    }
    const hab = habTimeField(fx.grid, fx.shape.hab, scenario);
    for (const k of inside) {
      expect(hab.seconds[k]).toBe(Infinity);
      expect(hab.prev[k]).toBe(-1);
    }
    for (const k of ring) expect(hab.seconds[k]).toBe(Infinity);
    expect(hab.seconds[mustCell(g, { x_m: -1000, y_m: 330 })]).toBeLessThan(Infinity);
    expect(timeAt(hab, fx.shape.crew.x_m, fx.shape.crew.y_m)).toBeLessThan(Infinity);
  });

  it("ramp: the gradient sign is flipped, so walking toward the hab downhill is faster than uphill", () => {
    const grid = flatGrid({ cell_m: 5, cellsWest: 40, cellsEast: 40, cellsNorth: 6, cellsSouth: 6 });
    const rise = Math.tan((5 * Math.PI) / 180); // 5 deg, below the caution slope; z increases to the east
    for (let k = 0; k < grid.meta.width * grid.meta.height; k++) {
      grid.elevation[k] = fixtureCellCentre(grid.meta, k).x_m * rise;
      grid.slopeP90[k] = 20;
      grid.slopeMax[k] = 20;
    }
    const g = geoOf(grid);
    const habCell = mustCell(g, { x_m: 0, y_m: 0 });
    const hab = habTimeField(grid, { x_m: 0, y_m: 0 }, scenario);
    const east = mustCell(g, { x_m: g.cell_m, y_m: 0 });
    const west = mustCell(g, { x_m: -g.cell_m, y_m: 0 });
    // One orthogonal step is the cheapest way to reach a neighbour; travel is neighbour -> hab, dz = z[hab] - z[neighbour].
    const stepEast = refSuitedStep(g.cell_m, grid.elevation[habCell]! - grid.elevation[east]!, 1);
    const stepWest = refSuitedStep(g.cell_m, grid.elevation[habCell]! - grid.elevation[west]!, 1);
    expect(hab.seconds[east]).toBeCloseTo(stepEast, 9);
    expect(hab.seconds[west]).toBeCloseTo(stepWest, 9);
    const flatStep = g.cell_m / v0;
    expect(hab.seconds[east]!).toBeLessThan(flatStep); // walking downhill toward the hab
    expect(hab.seconds[west]!).toBeGreaterThan(flatStep); // walking uphill toward the hab
    const far = (sign: number) => hab.seconds[mustCell(g, { x_m: sign * 100, y_m: 0 })]!;
    expect(far(+1)).toBeLessThan(far(-1));
  });

  it("matches a brute-force reference on non-flat terrain with caution, LOW_TI, hazard and over-limit cells", () => {
    const grid = bumpyGrid();
    const g = geoOf(grid);
    const start = mustCell(g, { x_m: 0, y_m: 0 });
    const hab = habTimeField(grid, { x_m: 0, y_m: 0 }, scenario);
    const ref = referenceField(grid, scenario, start, true);
    const bad: number[] = [];
    for (let k = 0; k < ref.length; k++) {
      const a = hab.seconds[k]!;
      const b = ref[k]!;
      if (a === b) continue;
      if (!(Math.abs(a - b) <= 1e-9 * Math.abs(b))) bad.push(k);
    }
    expectNoMismatch(bad, "hab vs reference");
    expect(ref.some((t) => t === Infinity)).toBe(true); // the hazard block and the over-limit cell are really unreachable
  });

  it("is impassable for slope_p90 above the limit, HARD_HAZARD, NO_DATA, slope 255 and NaN elevation; at the limit it is passable", () => {
    const fx = havenFlat();
    const g = geoOf(fx.grid);
    const at = (x: number) => mustCell(g, { x_m: x, y_m: 200 });
    const limitU8 = scenario.hard_slope_limit_deg * 4;
    fx.grid.slopeP90[at(-100)] = limitU8 + 1;
    fx.grid.flags[at(-200)]! |= HARD_BIT;
    fx.grid.flags[at(-300)]! |= NO_DATA_BIT;
    fx.grid.slopeP90[at(-400)] = 255;
    fx.grid.elevation[at(-500)] = NaN;
    fx.grid.slopeP90[at(-600)] = limitU8;
    const hab = habTimeField(fx.grid, fx.shape.hab, scenario);
    for (const x of [-100, -200, -300, -400, -500]) expect(hab.seconds[at(x)], `x=${x}`).toBe(Infinity);
    expect(hab.seconds[at(-600)]).toBeLessThan(Infinity);
  });

  it("the caution and the LOW_TI multiplier add (m - 1) times the plain time of a band the route must cross", () => {
    // A band of 10 columns across the full height: every path enters exactly 10 band cells at the cheapest.
    const bandCells = 10;
    const plain = flatCase().shape.crewToHab_m / v0;
    const cases: { name: string; flag: "caution" | "lowti" | "both"; mult: number }[] = [
      { name: "caution", flag: "caution", mult: D2_CAUTION_MULT },
      { name: "low TI", flag: "lowti", mult: D2_LOW_TI_MULT },
      { name: "both (they multiply, as in v1 route.ts)", flag: "both", mult: D2_CAUTION_MULT * D2_LOW_TI_MULT },
    ];
    for (const c of cases) {
      const fx = havenFlat();
      const g = geoOf(fx.grid);
      const box = { x0: 300, x1: 300 + bandCells * g.cell_m, y0: -1e6, y1: 1e6 };
      if (c.flag !== "lowti") {
        for (let k = 0; k < fx.grid.slopeMax.length; k++) {
          const p = fixtureCellCentre(fx.grid.meta, k);
          if (p.x_m >= box.x0 && p.x_m < box.x1) fx.grid.slopeMax[k] = (scenario.caution_slope_deg + 1) * 4;
        }
      }
      if (c.flag !== "caution") markBox(fx.grid, box, LOW_TI_BIT);
      const expected = plain + ((c.mult - 1) * bandCells * g.cell_m) / v0;
      const hab = habTimeField(fx.grid, fx.shape.hab, scenario);
      expect(timeAt(hab, fx.shape.crew.x_m, fx.shape.crew.y_m), `${c.name}, hab field`).toBeCloseTo(expected, 6);
      const crew = crewTimeField(fx.grid, fx.shape.hab, scenario, Infinity);
      expect(timeAt(crew, fx.shape.crew.x_m, fx.shape.crew.y_m), `${c.name}, forward field`).toBeCloseTo(expected, 6);
    }
  });

  it("charges the multiplier on the cell entered in the direction of travel, as v1 route.ts does", () => {
    const fx = havenFlat();
    const g = geoOf(fx.grid);
    const cautionCell = mustCell(g, { x_m: 3 * g.cell_m, y_m: 0 });
    fx.grid.slopeMax[cautionCell] = (scenario.caution_slope_deg + 1) * 4;
    const step = g.cell_m / v0;
    const hab = habTimeField(fx.grid, fx.shape.hab, scenario);
    // Toward the hab the caution cell is departed from, never entered, when it is the start of the walk.
    expect(hab.seconds[cautionCell]).toBeCloseTo(3 * step, 6);
    // One cell further out, the walk enters it (bypassing it by two diagonals costs more: 2 sqrt 2 + 2 > 4.5).
    expect(timeAt(hab, 4 * g.cell_m, 0)).toBeCloseTo((3 + D2_CAUTION_MULT) * step, 6);
    // Away from the hab the caution cell is entered on its own last step.
    const out = crewTimeField(fx.grid, fx.shape.hab, scenario, Infinity);
    expect(out.seconds[cautionCell]).toBeCloseTo((2 + D2_CAUTION_MULT) * step, 6);
    expect(timeAt(out, 4 * g.cell_m, 0)).toBeCloseTo((3 + D2_CAUTION_MULT) * step, 6);
  });

  it("is deterministic: two runs give identical seconds and prev", () => {
    const grid = bumpyGrid();
    const a = habTimeField(grid, { x_m: 0, y_m: 0 }, scenario);
    const b = habTimeField(grid, { x_m: 0, y_m: 0 }, scenario);
    expect(Array.from(a.seconds)).toEqual(Array.from(b.seconds));
    expect(Array.from(a.prev)).toEqual(Array.from(b.prev));
  });

  it("throws a RangeError for a hab outside the grid (Proposed)", () => {
    const { grid } = flatCase();
    expect(() => habTimeField(grid, { x_m: 1e6, y_m: 0 }, scenario)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// timeAt / pathTo (02 §D.8, §D.10)
// ---------------------------------------------------------------------------

describe("timeAt / pathTo", () => {
  it("timeAt reads the containing cell; the west and north edges are inside, the east and south edges are outside", () => {
    const { hab, grid, shape } = flatCase();
    const g = geoOf(grid);
    const k = mustCell(g, shape.crew);
    expect(timeAt(hab, shape.crew.x_m + 2, shape.crew.y_m - 2)).toBe(hab.seconds[k]);
    expect(timeAt(hab, shape.crew.x_m - 2, shape.crew.y_m + 2)).toBe(hab.seconds[k]);
    expect(timeAt(hab, g.origin_m[0], g.origin_m[1])).toBe(hab.seconds[0]);
    expect(timeAt(hab, g.origin_m[0] + g.width * g.cell_m, 0)).toBe(Infinity);
    expect(timeAt(hab, 0, g.origin_m[1] - g.height * g.cell_m)).toBe(Infinity);
    expect(timeAt(hab, g.origin_m[0] - 0.001, 0)).toBe(Infinity);
    expect(timeAt(hab, 0, g.origin_m[1] + 0.001)).toBe(Infinity);
    expect(timeAt(hab, Number.NaN, 0)).toBe(Infinity);
  });

  it("timeAt is Infinity on an unreachable cell", () => {
    const { hab, shape } = wallCase();
    expect(timeAt(hab, shape.wall.x_m, 0)).toBe(Infinity);
  });

  it("pathTo runs from the query cell to the start; consecutive points are 8-neighbours; it ends on the start centre", () => {
    const { hab, grid, shape } = flatCase();
    const c = grid.meta.cell_m;
    const path = pathTo(hab, shape.crew.x_m, shape.crew.y_m);
    expect(path[0]).toEqual([shape.crew.x_m, shape.crew.y_m]);
    expect(path[path.length - 1]).toEqual([shape.hab.x_m, shape.hab.y_m]);
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i]![0] - path[i - 1]![0]);
      const dy = Math.abs(path[i]![1] - path[i - 1]![1]);
      expect(Math.max(dx, dy)).toBe(c);
    }
  });

  it("flat: the path has Chebyshev distance + 1 points", () => {
    const { hab, grid, shape } = flatCase();
    const g = geoOf(grid);
    for (const p of [shape.crew, shape.vehicle, { x_m: 300, y_m: 300 }]) {
      const k = mustCell(g, p);
      const kh = mustCell(g, shape.hab);
      const cheb = Math.max(Math.abs(rowOf(g, k) - rowOf(g, kh)), Math.abs(colOf(g, k) - colOf(g, kh)));
      expect(pathTo(hab, p.x_m, p.y_m).length).toBe(cheb + 1);
    }
  });

  it("pathTo at the start is just the start centre; outside the field or unreachable it is empty", () => {
    const { hab, shape } = flatCase();
    expect(pathTo(hab, shape.hab.x_m, shape.hab.y_m)).toEqual([[0, 0]]);
    expect(pathTo(hab, 1e6, 0)).toEqual([]);
    expect(pathTo(wallCase().hab, wallCase().shape.wall.x_m, 0)).toEqual([]);
  });

  it("pathTo terminates on a corrupt back-pointer cycle and returns an empty path (Proposed)", () => {
    const cyclic = manual([10, 20, 30], [1, 0, 1]);
    expect(pathTo(cyclic, 2.5, 0)).toEqual([]);
  });

  it("a bounded crew field has back-pointers to its start: the path ends on the crew position", () => {
    const { crew, shape } = flatCase();
    const far = { x_m: shape.crew.x_m - 300, y_m: 0 };
    const path = pathTo(crew, far.x_m, far.y_m);
    expect(path.length).toBe(300 / 5 + 1);
    expect(path[path.length - 1]).toEqual([shape.crew.x_m, shape.crew.y_m]);
  });
});

// ---------------------------------------------------------------------------
// vehiclePassable (02 §D.9)
// ---------------------------------------------------------------------------

describe("vehiclePassable", () => {
  it("is 1 on flat ground and has one entry per grid cell", () => {
    const { pass, grid } = flatCase();
    expect(pass.length).toBe(grid.meta.width * grid.meta.height);
    expect(pass.every((v) => v === 1)).toBe(true);
  });

  it("is 0 for HARD_HAZARD, NO_DATA, slope 255 and NaN elevation; at the ParamSet limit it is 1, above it 0", () => {
    const fx = havenFlat();
    const g = geoOf(fx.grid);
    const limitU8 = (pr1Params.values.hard_slope_deg as number) * 4;
    const at = (x: number) => mustCell(g, { x_m: x, y_m: 100 });
    fx.grid.flags[at(-100)]! |= HARD_BIT;
    fx.grid.flags[at(-200)]! |= NO_DATA_BIT;
    fx.grid.slopeP90[at(-300)] = 255;
    fx.grid.elevation[at(-400)] = NaN;
    fx.grid.slopeP90[at(-500)] = limitU8;
    fx.grid.slopeP90[at(-600)] = limitU8 + 1;
    const pass = vehiclePassable(fx.grid, pr1Params);
    for (const x of [-100, -200, -300, -400, -600]) expect(pass[at(x)], `x=${x}`).toBe(0);
    expect(pass[at(-500)]).toBe(1);
  });

  it("uses the vehicle ParamSet limit, not the scenario's: 17.5 degrees is passable for the rover and not for the suit", () => {
    const fx = havenFlat();
    const g = geoOf(fx.grid);
    const k = mustCell(g, { x_m: -100, y_m: 100 });
    fx.grid.slopeP90[k] = 70; // 17.5 deg: above the suit's 15, below the rover's 20
    expect(scenario.hard_slope_limit_deg).toBeLessThan(17.5);
    expect(pr1Params.values.hard_slope_deg as number).toBeGreaterThan(17.5);
    expect(vehiclePassable(fx.grid, pr1Params)[k]).toBe(1);
    expect(habTimeField(fx.grid, fx.shape.hab, scenario).seconds[k]).toBe(Infinity);
  });

  it("ridge: the flank columns are 0; the plateau and the foot are 1", () => {
    const fx = rendezvousRidge();
    const g = geoOf(fx.grid);
    const pass = vehiclePassable(fx.grid, pr1Params);
    expect(pass.length).toBe(g.width * g.height);
    const P = RIDGE_PLATEAU_HALF_CELLS;
    const F = RIDGE_FLANK_CELLS;
    const mid = Math.floor(g.height / 2);
    for (const sign of [-1, 1]) {
      for (let k = 0; k <= P + F + 3; k++) {
        const idx = mid * g.width + (g.width - 1) / 2 + sign * k;
        const flank = k > P && k <= P + F;
        expect(pass[idx], `k=${sign * k}`).toBe(flank ? 0 : 1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// vehicleTimeField: T_veh (02 §D.8, §D.9)
// ---------------------------------------------------------------------------

describe("vehicleTimeField (T_veh)", () => {
  it("aggregates the 5 m grid to a 10 m field with the same origin", () => {
    const { veh, grid } = flatCase();
    expect(veh.cell_m).toBe(VEHICLE_GRID_CELL_M);
    expect(veh.width).toBe(Math.ceil((grid.meta.width * grid.meta.cell_m) / VEHICLE_GRID_CELL_M));
    expect(veh.height).toBe(Math.ceil((grid.meta.height * grid.meta.cell_m) / VEHICLE_GRID_CELL_M));
    expect(veh.origin_m).toEqual(grid.meta.origin_m);
    expect(veh.seconds.length).toBe(veh.width * veh.height);
    expect(veh.prev.length).toBe(veh.width * veh.height);
  });

  it("flat: T_veh is the octile distance on the 10 m lattice over the flat speed", () => {
    const { veh, grid, shape } = flatCase();
    const vv = vvOf(pr1Params);
    const start = mustCell(veh, shape.vehicle);
    expect(veh.seconds[start]).toBe(0);
    const probes: XY[] = [
      shape.hab,
      shape.crew,
      { x_m: grid.meta.origin_m[0] + 1, y_m: grid.meta.origin_m[1] - 1 },
      { x_m: grid.meta.origin_m[0] + grid.meta.width * grid.meta.cell_m - 1, y_m: grid.meta.origin_m[1] - 1 },
      { x_m: grid.meta.origin_m[0] + 1, y_m: grid.meta.origin_m[1] - grid.meta.height * grid.meta.cell_m + 1 },
      { x_m: grid.meta.origin_m[0] + grid.meta.width * grid.meta.cell_m - 1, y_m: grid.meta.origin_m[1] - grid.meta.height * grid.meta.cell_m + 1 },
    ];
    for (const p of probes) {
      const q = mustCell(veh, p);
      expect(veh.seconds[q], `probe (${p.x_m}, ${p.y_m})`).toBeCloseTo((octileCells(veh, start, q) * VEHICLE_GRID_CELL_M) / vv, 6);
    }
  });

  it("flat: T_veh(hab) is the declared 2 km over the flat speed, within the 2.5 m aggregate offset at each end", () => {
    const { veh, shape } = flatCase();
    const vv = vvOf(pr1Params);
    const offsetTolerance_m = 2 * 2.5; // v2grids.ts header: an aggregate centre may be 2.5 m off a declared point
    expect(Math.abs(timeAt(veh, shape.hab.x_m, shape.hab.y_m) * vv - shape.vehicleToHab_m)).toBeLessThanOrEqual(offsetTolerance_m);
  });

  it("a 10 m input grid is its own aggregate: same lattice, T_veh(hab) = vehicleToHab_m / vv exactly", () => {
    const fx = havenFlat(10);
    const veh = vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params);
    expect(veh.cell_m).toBe(10);
    expect([veh.width, veh.height]).toEqual([fx.grid.meta.width, fx.grid.meta.height]);
    expect(veh.origin_m).toEqual(fx.grid.meta.origin_m);
    expect(timeAt(veh, fx.shape.hab.x_m, fx.shape.hab.y_m)).toBeCloseTo(fx.shape.vehicleToHab_m / vvOf(pr1Params), 6);
  });

  it("aggregation (Proposed): a 10 m cell is passable only if all its 5 m children are, whichever single child is a hazard", () => {
    const probe = { x_m: -1000, y_m: 0 };
    const base = havenFlat();
    const g = geoOf(base.grid);
    const parentOf = (veh: TimeField) => mustCell(veh, probe);
    const children: number[] = [];
    const veh0 = vehicleTimeField(base.grid, base.shape.vehicle, pr1Params);
    for (let k = 0; k < base.grid.flags.length; k++) if (mustCell(veh0, centreOf(g, k)) === parentOf(veh0)) children.push(k);
    expect(children.length).toBe(4);
    expect(timeAt(veh0, probe.x_m, probe.y_m)).toBeLessThan(Infinity); // free without the hazard
    for (const hazardChild of children) {
      const fx = havenFlat();
      fx.grid.flags[hazardChild]! |= HARD_BIT;
      const veh = vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params);
      for (const k of children) {
        const c = centreOf(g, k);
        expect(timeAt(veh, c.x_m, c.y_m), `hazard ${hazardChild}, child ${k}`).toBe(Infinity); // free on the 5 m grid, blocked here
      }
      expect(timeAt(veh, probe.x_m + 20, probe.y_m)).toBeLessThan(Infinity);
      expect(timeAt(veh, probe.x_m - 20, probe.y_m)).toBeLessThan(Infinity);
    }
  });

  it("aggregation: the 1-cell-thick 5 m wall becomes a 10 m obstacle, including the free half of its parent", () => {
    const { veh, shape } = wallCase();
    expect(timeAt(veh, shape.wall.x_m, 0)).toBe(Infinity);
    expect(timeAt(veh, shape.wall.x_m + 5, 0)).toBe(Infinity); // the other 5 m child of the wall's parent is free in the grid
    expect(timeAt(veh, shape.wall.x_m + 15, 0)).toBeLessThan(Infinity); // east of the wall, reached by the detour
  });

  it("ridge: the flank and everything behind it are Infinity; the west foot is reached from the west", () => {
    const fx = rendezvousRidge();
    const veh = vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params);
    const c = fx.grid.meta.cell_m;
    const P = RIDGE_PLATEAU_HALF_CELLS;
    const F = RIDGE_FLANK_CELLS;
    for (let k = P + 1; k <= P + F; k++) expect(timeAt(veh, -k * c, 0), `west flank k=${k}`).toBe(Infinity);
    expect(timeAt(veh, 0, 0)).toBe(Infinity); // the plateau, where the crew stands
    expect(timeAt(veh, (P + F + 1) * c, 0)).toBe(Infinity); // the far (east) foot, behind the ridge
    expect(timeAt(veh, fx.shape.footCell.x_m, fx.shape.footCell.y_m)).toBeCloseTo(
      Math.abs(fx.shape.footCell.x_m - fx.shape.vehicle.x_m) / vvOf(pr1Params),
      6,
    );
  });

  it("slope speed (02 §D.9): v = flat * max(min_speed_frac, 1 - |theta| / hard_slope_deg); uphill equals downhill", () => {
    const limit = pr1Params.values.hard_slope_deg as number;
    const minFrac = pr1Params.values.min_speed_frac as number;
    const vv = vvOf(pr1Params);
    for (const deg of [10, 19]) {
      // 10 deg: 1 - 10/20 = 0.5 > 0.3. 19 deg: 1 - 19/20 = 0.05 is clamped to min_speed_frac.
      const grid = flatGrid({ cell_m: 10, cellsWest: 6, cellsEast: 6, cellsNorth: 3, cellsSouth: 3 });
      const rise = Math.tan((deg * Math.PI) / 180);
      for (let k = 0; k < grid.meta.width * grid.meta.height; k++) {
        grid.elevation[k] = fixtureCellCentre(grid.meta, k).x_m * rise;
        grid.slopeP90[k] = deg * 4;
        grid.slopeMax[k] = deg * 4;
      }
      const g = geoOf(grid);
      const veh = vehicleTimeField(grid, { x_m: 0, y_m: 0 }, pr1Params);
      const kNow = mustCell(g, { x_m: 0, y_m: 0 });
      for (const sign of [+1, -1]) {
        const kNext = mustCell(g, { x_m: sign * g.cell_m, y_m: 0 });
        const dz = Math.abs(grid.elevation[kNext]! - grid.elevation[kNow]!);
        const theta = (Math.atan(dz / g.cell_m) * 180) / Math.PI;
        const speed = vv * Math.max(minFrac, 1 - theta / limit);
        expect(veh.seconds[kNext], `${deg} deg, direction ${sign}`).toBeCloseTo(Math.sqrt(g.cell_m * g.cell_m + dz * dz) / speed, 9);
      }
      if (deg === 19) expect(1 - 19 / limit).toBeLessThan(minFrac); // the clamp is really exercised
    }
  });

  it("a LOW_TI band multiplies the step time by low_ti_cost (02 §D.9)", () => {
    const fx = havenFlat(10);
    const g = geoOf(fx.grid);
    const bandCells = 10;
    markBox(fx.grid, { x0: -1500, x1: -1500 + bandCells * g.cell_m, y0: -1e6, y1: 1e6 }, LOW_TI_BIT);
    const veh = vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params);
    const target = { x_m: -1000, y_m: 0 };
    const plain = Math.abs(target.x_m - fx.shape.vehicle.x_m) / vvOf(pr1Params);
    const lowTi = pr1Params.values.low_ti_cost as number;
    expect(timeAt(veh, target.x_m, target.y_m)).toBeCloseTo(plain + ((lowTi - 1) * bandCells * g.cell_m) / vvOf(pr1Params), 6);
  });

  it("rejects a ParamSet of another kind, or one with a missing or non-finite flat_speed_kmh, hard_slope_deg or min_speed_frac", () => {
    const { grid, shape } = flatCase();
    const withValues = (patch: Record<string, number | undefined>): ParamSet => {
      const values: Record<string, number | boolean> = { ...pr1Params.values };
      for (const [key, v] of Object.entries(patch)) {
        if (v === undefined) delete values[key];
        else values[key] = v;
      }
      return { ...pr1Params, values };
    };
    expect(() => vehicleTimeField(grid, shape.vehicle, { ...pr1Params, kind: "suit" })).toThrow(/kind/);
    expect(() => vehicleTimeField(grid, shape.vehicle, withValues({ flat_speed_kmh: undefined }))).toThrow(/flat_speed_kmh/);
    expect(() => vehicleTimeField(grid, shape.vehicle, withValues({ flat_speed_kmh: Number.NaN }))).toThrow(/flat_speed_kmh/);
    expect(() => vehicleTimeField(grid, shape.vehicle, withValues({ hard_slope_deg: undefined }))).toThrow(/hard_slope_deg/);
    expect(() => vehicleTimeField(grid, shape.vehicle, withValues({ hard_slope_deg: Number.POSITIVE_INFINITY }))).toThrow(/hard_slope_deg/);
    expect(() => vehicleTimeField(grid, shape.vehicle, withValues({ min_speed_frac: undefined }))).toThrow(/min_speed_frac/);
    expect(() => vehicleTimeField(grid, shape.vehicle, withValues({ min_speed_frac: Number.NaN }))).toThrow(/min_speed_frac/);
    expect(() => vehiclePassable(grid, { ...pr1Params, kind: "link" })).toThrow(/kind/);
  });

  it("throws a RangeError for a vehicle outside the grid (Proposed)", () => {
    const { grid } = flatCase();
    expect(() => vehicleTimeField(grid, { x_m: 0, y_m: 1e6 }, pr1Params)).toThrow(RangeError);
  });

  it("is deterministic: two runs give identical seconds and prev", () => {
    const fx = rendezvousRidge();
    const a = vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params);
    const b = vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params);
    expect(Array.from(a.seconds)).toEqual(Array.from(b.seconds));
    expect(Array.from(a.prev)).toEqual(Array.from(b.prev));
  });
});

// ---------------------------------------------------------------------------
// crewTimeField: bounded Dijkstra (02 §D.8, "stopped at 30 min")
// ---------------------------------------------------------------------------

describe("crewTimeField (bounded)", () => {
  /** Cells whose flat-ground time is clearly inside or outside the limit (boundary ties are skipped). */
  function checkFlat(field: TimeField, g: Geo, start: number, limit: number): number[] {
    const bad: number[] = [];
    for (let k = 0; k < field.seconds.length; k++) {
      const expected = (octileCells(g, k, start) * g.cell_m) / v0;
      const got = field.seconds[k]!;
      if (Math.abs(expected - limit) < 1e-6) continue;
      if (expected < limit) {
        if (!(Math.abs(got - expected) <= 1e-9 * Math.max(1, expected))) bad.push(k);
      } else if (got !== Infinity) bad.push(k);
    }
    return bad;
  }

  it("every finite value is within the limit, and on flat ground a cell is finite iff its octile time is", () => {
    const { grid, shape } = flatCase();
    const g = geoOf(grid);
    const start = mustCell(g, shape.crew);
    for (const limit of [60, limitS]) {
      const field = crewTimeField(grid, shape.crew, scenario, limit);
      for (let k = 0; k < field.seconds.length; k++) {
        const t = field.seconds[k]!;
        if (t !== Infinity && t > limit) throw new Error(`cell ${k} has ${t} > ${limit}`);
      }
      expectNoMismatch(checkFlat(field, g, start, limit), `limit ${limit}`);
    }
  });

  it("the haven rule is user data: the scenario's max_haven_min decides the bound", () => {
    const { grid, shape } = flatCase();
    const shorter = crewTimeField(grid, shape.crew, scenario, 10 * 60);
    const longer = crewTimeField(grid, shape.crew, scenario, scenario.max_haven_min * 60);
    const count = (f: TimeField) => f.seconds.reduce((n, t) => n + (t < Infinity ? 1 : 0), 0);
    expect(count(shorter)).toBeLessThan(count(longer));
  });

  it("inside the bound the values equal the unbounded field's; beyond it they are Infinity", () => {
    const { grid, shape } = flatCase();
    const limit = 600;
    const bounded = crewTimeField(grid, shape.crew, scenario, limit);
    const full = crewTimeField(grid, shape.crew, scenario, Infinity);
    const bad: number[] = [];
    for (let k = 0; k < full.seconds.length; k++) {
      const t = full.seconds[k]!;
      if (t <= limit - 1e-6 && bounded.seconds[k] !== t) bad.push(k);
      if (t > limit + 1e-6 && bounded.seconds[k] !== Infinity) bad.push(k);
    }
    expectNoMismatch(bad, "bounded vs unbounded");
  });

  it("matches a brute-force reference on non-flat terrain (forward gradient sign)", () => {
    const grid = bumpyGrid();
    const g = geoOf(grid);
    const from = { x_m: -50, y_m: 40 };
    const field = crewTimeField(grid, from, scenario, Infinity);
    const ref = referenceField(grid, scenario, mustCell(g, from), false);
    const bad: number[] = [];
    for (let k = 0; k < ref.length; k++) {
      const a = field.seconds[k]!;
      const b = ref[k]!;
      if (a !== b && !(Math.abs(a - b) <= 1e-9 * Math.abs(b))) bad.push(k);
    }
    expectNoMismatch(bad, "crew vs reference");
  });

  it("limit 0: only the start cell is finite", () => {
    const { grid, shape } = flatCase();
    const field = crewTimeField(grid, shape.crew, scenario, 0);
    const finite: number[] = [];
    field.seconds.forEach((t, k) => {
      if (t !== Infinity) finite.push(k);
    });
    expect(finite).toEqual([mustCell(geoOf(grid), shape.crew)]);
    expect(field.seconds[finite[0]!]).toBe(0);
    expect(field.prev[finite[0]!]).toBe(-1);
  });

  it("a start outside the grid gives an all-Infinity field of the grid's size (Proposed)", () => {
    const { grid } = flatCase();
    const field = crewTimeField(grid, { x_m: 1e6, y_m: 0 }, scenario, limitS);
    expect(field.seconds.length).toBe(grid.meta.width * grid.meta.height);
    expect(field.seconds.every((t) => t === Infinity)).toBe(true);
    expect(field.prev.every((p) => p === -1)).toBe(true);
  });

  it("rejects a negative or NaN limit with a RangeError (Proposed)", () => {
    const { grid, shape } = flatCase();
    expect(() => crewTimeField(grid, shape.crew, scenario, -1)).toThrow(RangeError);
    expect(() => crewTimeField(grid, shape.crew, scenario, Number.NaN)).toThrow(RangeError);
  });

  it("is deterministic: two runs give identical seconds and prev", () => {
    const grid = bumpyGrid();
    const a = crewTimeField(grid, { x_m: 10, y_m: -20 }, scenario, 500);
    const b = crewTimeField(grid, { x_m: 10, y_m: -20 }, scenario, 500);
    expect(Array.from(a.seconds)).toEqual(Array.from(b.seconds));
    expect(Array.from(a.prev)).toEqual(Array.from(b.prev));
  });
});

// ---------------------------------------------------------------------------
// liveHaven (02 §D.8, live form)
// ---------------------------------------------------------------------------

describe("liveHaven", () => {
  /**
   * Brute force over the crew field's 5 m cells for the flat case: key = max(T_crew(q), T_veh(q)) with both times
   * in closed form (octile distance), T_veh sampled from the 10 m parent of q. Returns the best key and the set
   * of cells that achieve it, then the minimum T_crew among those.
   */
  function flatVehicleOracle(vv: number) {
    const { grid, shape, veh } = flatCase();
    const g = geoOf(grid);
    const crewCell = mustCell(g, shape.crew);
    const vehCell = mustCell(veh, shape.vehicle);
    let best = Infinity;
    let bestTc = Infinity;
    const entries: { k: number; key: number; tc: number }[] = [];
    for (let k = 0; k < g.width * g.height; k++) {
      const tc = (octileCells(g, k, crewCell) * g.cell_m) / v0;
      if (tc > limitS) continue;
      const parent = mustCell(veh, centreOf(g, k));
      const tv = (octileCells(veh, vehCell, parent) * VEHICLE_GRID_CELL_M) / vv;
      const key = Math.max(tc, tv);
      entries.push({ k, key, tc });
      if (key < best - 1e-9 || (Math.abs(key - best) <= 1e-9 && tc < bestTc)) {
        best = key;
        bestTc = tc;
      }
    }
    const targets = entries.filter((e) => Math.abs(e.key - best) <= 1e-6 && Math.abs(e.tc - bestTc) <= 1e-6).map((e) => centreOf(g, e.k));
    return { best, bestTc, targets };
  }

  it("flat, fast rover: the vehicle branch wins, haven_s = best meeting key + the vehicle ingress, at the argmin cell", () => {
    const { hab, crew, veh, pass, shape } = flatCase();
    const oracle = flatVehicleOracle(vvOf(pr1Params));
    const habBranch = shape.crewToHab_m / v0 + ingress.hab_s;
    expect(oracle.best + ingress.vehicle_s).toBeLessThan(habBranch); // precondition: the vehicle really is faster
    // Independent closed form: crew and rover approach each other along the row, so they meet after
    // (crew-to-vehicle distance) / (v0 + vv). The grid answer differs by the cell quantisation: 5 m crew cells and
    // the 2.5 m aggregate offset of the 10 m rover cell (v2grids.ts header), converted at the slower speed.
    const meet_s = (shape.crewToHab_m + shape.vehicleToHab_m) / (v0 + vvOf(pr1Params));
    expect(Math.abs(oracle.best - meet_s)).toBeLessThanOrEqual((2 * 2.5 + 5) / v0);
    const r = liveHaven(hab, crew, veh, pass, ingress, shape.crew);
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("vehicle");
    expect(r!.haven_s).toBeCloseTo(oracle.best + ingress.vehicle_s, 6);
    const hit = oracle.targets.some((t) => Math.abs(t.x_m - r!.target_x_m) < 1e-9 && Math.abs(t.y_m - r!.target_y_m) < 1e-9);
    expect(hit, `target (${r!.target_x_m}, ${r!.target_y_m}) is one of ${oracle.targets.length} oracle cells`).toBe(true);
  });

  it("the haven time is the minimum of the two branches", () => {
    const { hab, crew, veh, pass, shape } = flatCase();
    const r = liveHaven(hab, crew, veh, pass, ingress, shape.crew)!;
    const habOnly = liveHaven(hab, crew, null, null, ingress, shape.crew)!;
    expect(habOnly.kind).toBe("hab");
    expect(r.haven_s).toBeLessThanOrEqual(habOnly.haven_s);
  });

  /** The best meeting key of the flat case for a given rover field, by brute force over the crew's cells. */
  function bestKeyFor(veh: TimeField, vv: number): number {
    const { grid, shape } = flatCase();
    const g = geoOf(grid);
    const crewCell = mustCell(g, shape.crew);
    const vehCell = mustCell(veh, shape.vehicle);
    let best = Infinity;
    for (let k = 0; k < g.width * g.height; k++) {
      const tc = (octileCells(g, k, crewCell) * g.cell_m) / v0;
      if (tc > limitS) continue;
      const tv = (octileCells(veh, vehCell, mustCell(veh, centreOf(g, k))) * VEHICLE_GRID_CELL_M) / vv;
      best = Math.min(best, Math.max(tc, tv));
    }
    return best;
  }

  it("vehicle slower than walking: the hab is chosen, haven_s = T_hab(crew) + the hab ingress, target = the hab", () => {
    const { params, veh, pass } = slowCase();
    const { hab, crew, shape } = flatCase();
    expect(vvOf(params)).toBeLessThan(v0); // precondition from the ParamSets
    expect(bestKeyFor(veh, vvOf(params)) + ingress.vehicle_s).toBeGreaterThan(shape.crewToHab_m / v0 + ingress.hab_s);
    const r = liveHaven(hab, crew, veh, pass, ingress, shape.crew)!;
    expect(r.kind).toBe("hab");
    expect(r.haven_s).toBeCloseTo(shape.crewToHab_m / v0 + HAB_INGRESS_S, 6);
    expect([r.target_x_m, r.target_y_m]).toEqual([shape.hab.x_m, shape.hab.y_m]);
  });

  it("no vehicle, or no passable mask: the hab branch", () => {
    const { hab, crew, veh, pass, shape } = flatCase();
    for (const [v, p] of [
      [null, pass],
      [veh, null],
      [null, null],
    ] as const) {
      const r = liveHaven(hab, crew, v, p, ingress, shape.crew)!;
      expect(r.kind).toBe("hab");
      expect(r.haven_s).toBeCloseTo(shape.crewToHab_m / v0 + ingress.hab_s, 6);
      expect([r.target_x_m, r.target_y_m]).toEqual([shape.hab.x_m, shape.hab.y_m]);
    }
  });

  it("a mask that is 0 everywhere removes the vehicle branch even for a fast rover", () => {
    const { hab, crew, veh, shape } = flatCase();
    const none = new Uint8Array(hab.seconds.length);
    const r = liveHaven(hab, crew, veh, none, ingress, shape.crew)!;
    expect(r.kind).toBe("hab");
    expect(r.haven_s).toBeCloseTo(shape.crewToHab_m / v0 + ingress.hab_s, 6);
  });

  it("wall detour: haven_hab = the detour walking time + the hab ingress", () => {
    const { hab, crew, shape } = wallCase();
    const r = liveHaven(hab, crew, null, null, ingress, shape.crew)!;
    expect(r.kind).toBe("hab");
    expect(r.haven_s).toBeCloseTo(wallDetourSeconds() + ingress.hab_s, 6);
    expect(DETOUR_WALL_X_M).toBe(shape.wall.x_m);
  });

  it("returns null when nothing is reachable (crew sealed off from the hab and from the rover)", () => {
    const fx = havenFlat();
    const g = geoOf(fx.grid);
    const crewCell = mustCell(g, fx.shape.crew);
    for (let di = -2; di <= 2; di++) {
      for (let dj = -2; dj <= 2; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) === 2) fx.grid.flags[(rowOf(g, crewCell) + di) * g.width + colOf(g, crewCell) + dj]! |= HARD_BIT;
      }
    }
    const hab = habTimeField(fx.grid, fx.shape.hab, scenario);
    const crew = crewTimeField(fx.grid, fx.shape.crew, scenario, limitS);
    const veh = vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params);
    const pass = vehiclePassable(fx.grid, pr1Params);
    expect(liveHaven(hab, crew, null, null, ingress, fx.shape.crew)).toBeNull();
    expect(liveHaven(hab, crew, veh, pass, ingress, fx.shape.crew)).toBeNull();
  });

  describe("on hand-built fields (three cells in a row, centres x = 2.5, 7.5, 12.5)", () => {
    const hab = manual([0, 60, 120], [-1, 0, 1]);
    const at = { x_m: 12.5, y_m: 0 };
    const allPass = Uint8Array.from([1, 1, 1]);

    it("an exact tie between the branches goes to the hab (Proposed); one second less on the vehicle side flips it", () => {
      const crew = manual([40, 20, 0], [1, 2, -1]);
      const veh = manual([100, 100, 100], [-1, 0, 1]);
      const tie = liveHaven(hab, crew, veh, allPass, { hab_s: 30, vehicle_s: 50 }, at)!;
      expect(tie).toEqual({ haven_s: 150, kind: "hab", target_x_m: 2.5, target_y_m: 0 });
      const faster = liveHaven(hab, crew, veh, allPass, { hab_s: 30, vehicle_s: 49 }, at)!;
      expect(faster).toEqual({ haven_s: 149, kind: "vehicle", target_x_m: 12.5, target_y_m: 0 });
      const slower = liveHaven(hab, crew, veh, allPass, { hab_s: 30, vehicle_s: 51 }, at)!;
      expect(slower.kind).toBe("hab");
      expect(slower.haven_s).toBe(150);
    });

    it("equal meeting keys: the cell with the smaller crew time wins, then the lower cell index (NFR-06)", () => {
      const veh = manual([100, 100, 100], [-1, 0, 1]);
      const far = { hab_s: 1000, vehicle_s: 50 };
      const byCrewTime = liveHaven(hab, manual([30, 20, 20], [1, 2, -1]), veh, allPass, far, at)!;
      expect([byCrewTime.target_x_m, byCrewTime.target_y_m]).toEqual([7.5, 0]); // cells 1 and 2 tie on T_crew: index 1
      const byIndex = liveHaven(hab, manual([20, 20, 20], [1, 2, -1]), veh, allPass, far, at)!;
      expect([byIndex.target_x_m, byIndex.target_y_m]).toEqual([2.5, 0]);
      const smaller = liveHaven(hab, manual([30, 25, 20], [1, 2, -1]), veh, allPass, far, at)!;
      expect([smaller.target_x_m, smaller.target_y_m]).toEqual([12.5, 0]);
    });

    it("skips cells the crew cannot reach, the rover cannot reach, or the mask excludes", () => {
      const crew = manual([Infinity, 20, 10], [-1, 2, -1]);
      const veh = manual([100, Infinity, 100], [-1, -1, 0]);
      const r = liveHaven(hab, crew, veh, Uint8Array.from([1, 1, 0]), { hab_s: 1000, vehicle_s: 50 }, at);
      // cell 0: crew Infinity; cell 1: rover Infinity; cell 2: mask 0. Nothing left, so the hab (1120) answers.
      expect(r).toEqual({ haven_s: 1120, kind: "hab", target_x_m: 2.5, target_y_m: 0 });
      const r2 = liveHaven(hab, crew, veh, Uint8Array.from([1, 1, 1]), { hab_s: 1000, vehicle_s: 50 }, at)!;
      expect(r2).toEqual({ haven_s: 150, kind: "vehicle", target_x_m: 12.5, target_y_m: 0 });
    });

    it("null when the hab is unreachable and there is no vehicle", () => {
      const lost = manual([Infinity, Infinity, Infinity], [-1, -1, -1]);
      expect(liveHaven(lost, manual([40, 20, 0], [1, 2, -1]), null, null, ingress, at)).toBeNull();
    });

    it("throws a RangeError when the hab, crew and mask sizes differ", () => {
      const crew = manual([40, 20, 0], [1, 2, -1]);
      const veh = manual([100, 100, 100], [-1, 0, 1]);
      expect(() => liveHaven(hab, manual([20, 0], [1, -1]), veh, allPass, ingress, at)).toThrow(RangeError);
      expect(() => liveHaven(hab, crew, veh, Uint8Array.from([1, 1]), ingress, at)).toThrow(RangeError);
    });

    it("throws a RangeError when the fields have the same length but another geometry (transposed, other cell size or origin)", () => {
      const crew = manual([40, 20, 0], [1, 2, -1]);
      const veh = manual([100, 100, 100], [-1, 0, 1]);
      const transposed: TimeField = { ...crew, width: 1, height: 3 };
      expect(() => liveHaven(hab, transposed, veh, allPass, ingress, at)).toThrow(RangeError);
      expect(() => liveHaven({ ...hab, width: 1, height: 3 }, crew, veh, allPass, ingress, at)).toThrow(RangeError);
      expect(() => liveHaven(hab, { ...crew, cell_m: 10 }, veh, allPass, ingress, at)).toThrow(RangeError);
      expect(() => liveHaven({ ...hab, origin_m: [5, 2.5] }, crew, veh, allPass, ingress, at)).toThrow(RangeError);
      // The mask is a bare array, so only its length can be compared.
      expect(liveHaven(hab, crew, veh, allPass, ingress, at)).not.toBeNull();
    });

    it("throws a RangeError for an ingress value that is NaN, negative or not finite", () => {
      const crew = manual([40, 20, 0], [1, 2, -1]);
      const veh = manual([100, 100, 100], [-1, 0, 1]);
      for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(() => liveHaven(hab, crew, veh, allPass, { hab_s: bad, vehicle_s: 50 }, at), `hab_s ${bad}`).toThrow(RangeError);
        expect(() => liveHaven(hab, crew, veh, allPass, { hab_s: 30, vehicle_s: bad }, at), `vehicle_s ${bad}`).toThrow(RangeError);
        expect(() => liveHaven(hab, crew, null, null, { hab_s: 30, vehicle_s: bad }, at), `vehicle_s ${bad}, no rover`).toThrow(RangeError);
      }
      expect(liveHaven(hab, crew, veh, allPass, { hab_s: 0, vehicle_s: 0 }, at)).not.toBeNull(); // zero is allowed
    });
  });
});

// ---------------------------------------------------------------------------
// havenAlongRoute: planning approximation (02 §D.8), labelled modelled (approximation)
// ---------------------------------------------------------------------------

describe("havenAlongRoute (planning approximation)", () => {
  const samples: XY[] = Array.from({ length: CREW_FROM_HAB_M / HAVEN_SAMPLE_SPACING_M + 1 }, (_, k) => ({
    x_m: CREW_FROM_HAB_M - k * HAVEN_SAMPLE_SPACING_M,
    y_m: 0,
  }));

  /** Straight segment p -> q is walkable: sampled every metre, every cell it touches is passable for the suit. */
  function segmentClear(g: LoadedGrid, p: XY, q: XY): boolean {
    const len = dist(p, q);
    const steps = Math.max(1, Math.ceil(len));
    for (let s = 0; s <= steps; s++) {
      const x = p.x_m + ((q.x_m - p.x_m) * s) / steps;
      const y = p.y_m + ((q.y_m - p.y_m) * s) / steps;
      const k = cellAt(g.meta, x, y);
      if (k === null || suitedBlocked(g, scenario, k)) return false;
    }
    return true;
  }

  /**
   * Brute force: min over 10 m cells q within the planning radius of max(straight walk, T_veh(q)) + vehicle ingress.
   * `tveh(k)` supplies T_veh of 10 m cell k; `checkSegment` applies the "straight segment is passable" rule.
   */
  function vehicleBranch(g: LoadedGrid, veh: TimeField, tveh: (k: number) => number, p: XY, checkSegment: boolean): number {
    let best = Infinity;
    for (let k = 0; k < veh.seconds.length; k++) {
      const q = centreOf(veh, k);
      const d = dist(p, q);
      if (d > HAVEN_PLANNING_RADIUS_M) continue;
      const t = tveh(k);
      if (!Number.isFinite(t)) continue;
      const cand = Math.max(d / v0, t) + ingress.vehicle_s;
      if (cand >= best) continue;
      if (checkSegment && !segmentClear(g, p, q)) continue;
      best = cand;
    }
    return best;
  }

  it("returns one value per sample, in order, Infinity never for a reachable route", () => {
    const { grid, hab, veh } = flatCase();
    const out = havenAlongRoute(grid, samples, hab, veh, scenario, ingress);
    expect(out.length).toBe(samples.length);
    expect(out.every((t) => Number.isFinite(t))).toBe(true);
    expect(havenAlongRoute(grid, [], hab, veh, scenario, ingress)).toEqual([]);
  });

  it("no vehicle: T_hab(p) + the hab ingress at every sample", () => {
    const { grid, hab } = flatCase();
    const out = havenAlongRoute(grid, samples, hab, null, scenario, ingress);
    samples.forEach((p, k) => expect(out[k], `sample ${k}`).toBeCloseTo(Math.abs(p.x_m) / v0 + ingress.hab_s, 6));
  });

  it("scenario.vehicle_available false: the hab branch only, even with a rover field", () => {
    const { grid, hab, veh } = flatCase();
    const out = havenAlongRoute(grid, samples, hab, veh, { ...scenario, vehicle_available: false }, ingress);
    samples.forEach((p, k) => expect(out[k], `sample ${k}`).toBeCloseTo(Math.abs(p.x_m) / v0 + ingress.hab_s, 6));
  });

  it("flat, fast rover: equals min(hab branch, brute-force vehicle branch) at every sample", () => {
    const { grid, hab, veh, shape } = flatCase();
    const vv = vvOf(pr1Params);
    const vehCell = mustCell(veh, shape.vehicle);
    const out = havenAlongRoute(grid, samples, hab, veh, scenario, ingress);
    let vehicleWins = 0;
    samples.forEach((p, k) => {
      const habBranch = Math.abs(p.x_m) / v0 + ingress.hab_s;
      const vb = vehicleBranch(grid, veh, (q) => (octileCells(veh, vehCell, q) * VEHICLE_GRID_CELL_M) / vv, p, true);
      expect(out[k], `sample ${k}`).toBeCloseTo(Math.min(habBranch, vb), 6);
      if (vb < habBranch) vehicleWins++;
    });
    expect(vehicleWins).toBeGreaterThan(0); // the case is not vacuous: the rover branch wins at the far end
    expect(vehicleWins).toBeLessThan(samples.length); // and the hab wins near the hab
  });

  it("the radius is respected: a vehicle-branch value is never below the drive to the edge of the 300 m disc", () => {
    const { grid, hab, veh, shape } = flatCase();
    const vv = vvOf(pr1Params);
    const offset_m = 2 * 2.5; // aggregate centre offset (v2grids.ts header)
    const out = havenAlongRoute(grid, samples, hab, veh, scenario, ingress);
    samples.forEach((p, k) => {
      const habBranch = Math.abs(p.x_m) / v0 + ingress.hab_s;
      if (out[k]! >= habBranch - 1e-9) return;
      const lower = (dist(p, shape.vehicle) - HAVEN_PLANNING_RADIUS_M - offset_m) / vv + ingress.vehicle_s;
      expect(out[k]!, `sample ${k}`).toBeGreaterThanOrEqual(lower);
    });
  });

  it("vehicle slower than walking: every sample takes the hab branch", () => {
    const { grid, hab } = flatCase();
    const { veh } = slowCase();
    const out = havenAlongRoute(grid, samples, hab, veh, scenario, ingress);
    samples.forEach((p, k) => expect(out[k], `sample ${k}`).toBeCloseTo(Math.abs(p.x_m) / v0 + ingress.hab_s, 6));
  });

  it("a wall across the straight segment rules out the rover cells behind it, which raises the value", () => {
    const { grid, hab, veh, shape } = wallCase();
    const flat = flatCase();
    const p: XY = { x_m: shape.wall.x_m + 50, y_m: 0 }; // just east of the wall; the rover comes from the west
    const withWall = havenAlongRoute(grid, [p], hab, veh, scenario, ingress)[0]!;
    const withoutWall = havenAlongRoute(flat.grid, [p], flat.hab, flat.veh, scenario, ingress)[0]!;
    expect(withWall).toBeGreaterThan(withoutWall);
    const tveh = (k: number) => veh.seconds[k]!;
    const checked = vehicleBranch(grid, veh, tveh, p, true);
    const unchecked = vehicleBranch(grid, veh, tveh, p, false);
    expect(unchecked).toBeLessThan(checked); // precondition: the segment rule changes the answer here
    const habBranch = timeAt(hab, p.x_m, p.y_m) + ingress.hab_s;
    expect(withWall).toBeCloseTo(Math.min(habBranch, checked), 6);
  });

  it("a rover cell on an impassable cell is not a candidate: the value matches the brute force on the wall grid at every sample", () => {
    const { grid, hab, veh } = wallCase();
    const out = havenAlongRoute(grid, samples, hab, veh, scenario, ingress);
    samples.forEach((p, k) => {
      const habBranch = timeAt(hab, p.x_m, p.y_m) + ingress.hab_s;
      const vb = vehicleBranch(grid, veh, (q) => veh.seconds[q]!, p, true);
      expect(out[k], `sample ${k}`).toBeCloseTo(Math.min(habBranch, vb), 6);
    });
  });

  it("is Infinity where neither haven can be reached", () => {
    const { grid, hab } = wallCase();
    const sealed = havenAlongRoute(grid, [{ x_m: 1e6, y_m: 0 }], hab, null, scenario, ingress);
    expect(sealed).toEqual([Infinity]);
  });

  it("throws a RangeError for an ingress value that is NaN, negative or not finite", () => {
    const { grid, hab, veh } = flatCase();
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(() => havenAlongRoute(grid, samples, hab, veh, scenario, { hab_s: bad, vehicle_s: 50 }), `hab_s ${bad}`).toThrow(RangeError);
      expect(() => havenAlongRoute(grid, samples, hab, null, scenario, { hab_s: 30, vehicle_s: bad }), `vehicle_s ${bad}`).toThrow(RangeError);
    }
  });

  it("the label constant is frozen, so no caller can relabel the planning form", () => {
    // havenAlongRoute returns number[], so the caller (T23.03 / the planner UI) applies this label to the values.
    expect(Object.isFrozen(HAVEN_PLANNING_LABEL)).toBe(true);
    expect(HAVEN_PLANNING_LABEL.provenance).toBe("modelled");
    expect(HAVEN_PLANNING_LABEL.note).toBe("approximation");
    expect(() => {
      (HAVEN_PLANNING_LABEL as { provenance: string }).provenance = "measured";
    }).toThrow(TypeError); // modules are strict mode
  });

  it("is deterministic: two runs give identical values", () => {
    const { grid, hab, veh } = flatCase();
    expect(havenAlongRoute(grid, samples, hab, veh, scenario, ingress)).toEqual(havenAlongRoute(grid, samples, hab, veh, scenario, ingress));
  });
});

// ---------------------------------------------------------------------------
// Lattice cache (repeated calls with the same grid and ParamSet / scenario objects reuse the per-cell arrays)
// ---------------------------------------------------------------------------

describe("lattice cache", () => {
  it("repeated calls with the same objects give byte-identical fields", () => {
    const grid = bumpyGrid();
    const from = { x_m: 20, y_m: -30 };
    for (const make of [
      () => habTimeField(grid, { x_m: 0, y_m: 0 }, scenario),
      () => crewTimeField(grid, from, scenario, Infinity),
      () => vehicleTimeField(grid, from, pr1Params),
    ]) {
      const a = make();
      const b = make();
      expect(Array.from(b.seconds)).toEqual(Array.from(a.seconds));
      expect(Array.from(b.prev)).toEqual(Array.from(a.prev));
    }
  });

  it("another scenario object is not served the cached lattice; an edit in place is noticed", () => {
    const grid = bumpyGrid();
    const k = mustCell(geoOf(grid), { x_m: 10, y_m: 0 });
    grid.slopeP90[k] = 52; // 13 deg: passable at 15, not at 12
    const sc = defaultScenario();
    const first = crewTimeField(grid, { x_m: 0, y_m: 0 }, sc, Infinity);
    const strict = { ...sc, hard_slope_limit_deg: 12 };
    const second = crewTimeField(grid, { x_m: 0, y_m: 0 }, strict, Infinity);
    expect(first.seconds[k]).toBeLessThan(Infinity);
    expect(second.seconds[k]).toBe(Infinity);
    sc.hard_slope_limit_deg = 12; // the same object, edited
    expect(crewTimeField(grid, { x_m: 0, y_m: 0 }, sc, Infinity).seconds[k]).toBe(Infinity);
  });

  it("another ParamSet object is not served the cached lattice; an edit in place is noticed", () => {
    const fx = havenFlat(10);
    markBox(fx.grid, { x0: -1500, x1: -1400, y0: -1e6, y1: 1e6 }, LOW_TI_BIT);
    const target = { x_m: -1000, y_m: 0 };
    const t1 = timeAt(vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params), target.x_m, target.y_m);
    const costly: ParamSet = { ...pr1Params, values: { ...pr1Params.values, low_ti_cost: 3 } };
    const t3 = timeAt(vehicleTimeField(fx.grid, fx.shape.vehicle, costly), target.x_m, target.y_m);
    expect(t3).toBeGreaterThan(t1);
    const again = timeAt(vehicleTimeField(fx.grid, fx.shape.vehicle, pr1Params), target.x_m, target.y_m);
    expect(again).toBe(t1);
    (costly.values as Record<string, number>).low_ti_cost = 2; // the same object, edited back to the pr1 value
    expect(timeAt(vehicleTimeField(fx.grid, fx.shape.vehicle, costly), target.x_m, target.y_m)).toBeCloseTo(t1, 9);
  });

  it("vehiclePassable returns a fresh array each time, so a caller may mutate it", () => {
    const { grid } = flatCase();
    const a = vehiclePassable(grid, pr1Params);
    a.fill(0);
    expect(vehiclePassable(grid, pr1Params).every((v) => v === 1)).toBe(true);
    expect(vehicleTimeField(grid, { x_m: -2000, y_m: 0 }, pr1Params).seconds.some((t) => t > 0 && t < Infinity)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Parity with the v1 step cost (T05b.04 follow-up; 02 §D.8 "v1 D.2 step cost")
// ---------------------------------------------------------------------------

/**
 * The v1 cost of walking `from` -> `to` (adjacent cells), in seconds, taken from TASK-05's own code only:
 * `toLeg` (leg.ts) sums `stepTimeH` with route.ts's multipliers over a cell path, and `walk_time_min` x 60 turns it
 * into seconds. Nothing of the formula is repeated here, so a change on either side shows up as a mismatch.
 */
function v1StepSeconds(grid: LoadedGrid, sc: MissionScenario, from: number, to: number): number {
  const leg = toLeg(grid, "from", "to", { status: "OK", cells: [from, to] }, sc);
  if (leg.status !== "OK") throw new Error("test setup: toLeg did not return an OK leg");
  return leg.walk_time_min * 60;
}

/**
 * bumpyGrid plus the cells whose step cost the two sides could disagree on: caution and LOW_TI on one cell (both),
 * a no-data slope_max (255) on passable cells, a NaN elevation, and slope_p90 exactly at the hard limit.
 */
function parityGrid(): { grid: LoadedGrid; both: number[]; noDataMax: number[]; nanCell: number; atLimit: number } {
  const grid = bumpyGrid();
  const g = geoOf(grid);
  const w = g.width;
  const both: number[] = [];
  for (let i = 25; i <= 30; i++) {
    const k = i * w + 13; // inside the LOW_TI strip
    grid.slopeMax[k] = (scenario.caution_slope_deg + 1) * 4;
    both.push(k);
  }
  const noDataMax: number[] = [];
  for (let i = 20; i <= 26; i++) {
    const k = i * w + 4;
    grid.slopeMax[k] = 255;
    noDataMax.push(k);
  }
  const nanCell = 18 * w + 18;
  grid.elevation[nanCell] = Number.NaN;
  const atLimit = 30 * w + 30;
  grid.slopeP90[atLimit] = scenario.hard_slope_limit_deg * 4;
  return { grid, both, noDataMax, nanCell, atLimit };
}

/** Relative 1e-9: the two sides may differ in the last bits (one `exp` vs two), never more. */
function closeRel(a: number, b: number): boolean {
  return a === b || Math.abs(a - b) <= 1e-9 * Math.abs(b);
}

describe("parity with the v1 step cost (route.ts / leg.ts / timeModel.ts)", () => {
  const hard = scenario.hard_slope_limit_deg;

  it("passability: a cell is reached only if v1's isCellPassable accepts it (the start excepted)", () => {
    const { grid, nanCell, atLimit } = parityGrid();
    const g = geoOf(grid);
    const start = mustCell(g, { x_m: 0, y_m: 0 });
    const hab = habTimeField(grid, { x_m: 0, y_m: 0 }, scenario);
    const crew = crewTimeField(grid, { x_m: 0, y_m: 0 }, scenario, Infinity);
    const bad: number[] = [];
    for (let k = 0; k < g.width * g.height; k++) {
      if (k === start) continue;
      const v1 = isCellPassable(grid, k, hard);
      if ((hab.seconds[k]! < Infinity && !v1) || (crew.seconds[k]! < Infinity && !v1)) bad.push(k);
    }
    expectNoMismatch(bad, "reached but not v1-passable");
    expect(isCellPassable(grid, nanCell, hard)).toBe(false);
    expect(hab.seconds[nanCell]).toBe(Infinity);
    expect(isCellPassable(grid, atLimit, hard)).toBe(true);
    expect(hab.seconds[atLimit]).toBeLessThan(Infinity);
  });

  it("hab field: every back-pointer step k -> prev[k] costs what v1 charges for walking it toward the hab", () => {
    const { grid, both, noDataMax } = parityGrid();
    const g = geoOf(grid);
    const hab = habTimeField(grid, { x_m: 0, y_m: 0 }, scenario);
    const bad: number[] = [];
    const seen = { plain: 0, caution: 0, lowTi: 0, both: 0, noDataMax: 0, diagUp: 0, diagDown: 0 };
    for (let k = 0; k < g.width * g.height; k++) {
      const p = hab.prev[k]!;
      if (p < 0) continue;
      if (!closeRel(hab.seconds[k]! - hab.seconds[p]!, v1StepSeconds(grid, scenario, k, p))) bad.push(k);
      // Coverage of the cases, by the cell entered on the walk k -> p (v1 charges the destination).
      const caution = grid.slopeMax[p]! !== 255 && grid.slopeMax[p]! / 4 > scenario.caution_slope_deg;
      const lowTi = (grid.flags[p]! & LOW_TI_BIT) !== 0;
      if (both.includes(p)) seen.both++;
      else if (caution) seen.caution++;
      else if (lowTi) seen.lowTi++;
      else seen.plain++;
      if (noDataMax.includes(p)) seen.noDataMax++;
      const diagonal = rowOf(g, k) !== rowOf(g, p) && colOf(g, k) !== colOf(g, p);
      if (diagonal && grid.elevation[p]! > grid.elevation[k]!) seen.diagUp++;
      if (diagonal && grid.elevation[p]! < grid.elevation[k]!) seen.diagDown++;
    }
    expectNoMismatch(bad, "hab step vs v1");
    for (const [name, count] of Object.entries(seen)) expect(count, `no hab step covers ${name}`).toBeGreaterThan(0);
  });

  it("crew field: every back-pointer step prev[k] -> k costs what v1 charges for walking it away from the start", () => {
    const { grid, both, noDataMax } = parityGrid();
    const g = geoOf(grid);
    const crew = crewTimeField(grid, { x_m: 0, y_m: 0 }, scenario, Infinity);
    const bad: number[] = [];
    let bothSeen = 0;
    let noDataSeen = 0;
    for (let k = 0; k < g.width * g.height; k++) {
      const p = crew.prev[k]!;
      if (p < 0) continue;
      if (!closeRel(crew.seconds[k]! - crew.seconds[p]!, v1StepSeconds(grid, scenario, p, k))) bad.push(k);
      if (both.includes(k)) bothSeen++;
      if (noDataMax.includes(k)) noDataSeen++;
    }
    expectNoMismatch(bad, "crew step vs v1");
    expect(bothSeen).toBeGreaterThan(0);
    expect(noDataSeen).toBeGreaterThan(0);
  });

  it("no field undercuts or overshoots v1 on any edge: T(k) <= T(p) + v1 step for every passable neighbour pair", () => {
    // Dijkstra optimality under v1's cost: if haven charged more than v1 on an edge that is not in the tree,
    // the tree checks above would not see it; this check does.
    const { grid } = parityGrid();
    const g = geoOf(grid);
    const hab = habTimeField(grid, { x_m: 0, y_m: 0 }, scenario);
    const crew = crewTimeField(grid, { x_m: 0, y_m: 0 }, scenario, Infinity);
    const bad: number[] = [];
    for (let u = 0; u < g.width * g.height; u++) {
      if (!isCellPassable(grid, u, hard)) continue;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (di === 0 && dj === 0) continue;
          const r = rowOf(g, u) + di;
          const c = colOf(g, u) + dj;
          if (r < 0 || c < 0 || r >= g.height || c >= g.width) continue;
          const v = r * g.width + c;
          if (!isCellPassable(grid, v, hard)) continue;
          const tol = (t: number) => t + 1e-9 * Math.max(1, t);
          // crew: walk u -> v; hab: walk v -> u (toward the hab).
          if (crew.seconds[u]! < Infinity && !(crew.seconds[v]! <= tol(crew.seconds[u]! + v1StepSeconds(grid, scenario, u, v)))) bad.push(v);
          if (hab.seconds[u]! < Infinity && !(hab.seconds[v]! <= tol(hab.seconds[u]! + v1StepSeconds(grid, scenario, v, u)))) bad.push(v);
        }
      }
    }
    expectNoMismatch(bad, "edge relaxation vs v1");
  });

  it("direct check: from one seeded cell each of the 8 neighbours reached directly costs v1's step, and none costs more", () => {
    const { grid } = parityGrid();
    const g = geoOf(grid);
    // A cell on sloping ground next to the caution strip, so the 8 steps differ in d, dz and multiplier.
    const s = 10 * g.width + 10;
    const sc = centreOf(g, s);
    const crew = crewTimeField(grid, sc, scenario, Infinity);
    const hab = habTimeField(grid, sc, scenario);
    let direct = 0;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const nb = (rowOf(g, s) + di) * g.width + colOf(g, s) + dj;
        const out = v1StepSeconds(grid, scenario, s, nb);
        const back = v1StepSeconds(grid, scenario, nb, s);
        expect(crew.seconds[nb]!).toBeLessThanOrEqual(out * (1 + 1e-9));
        expect(hab.seconds[nb]!).toBeLessThanOrEqual(back * (1 + 1e-9));
        if (crew.prev[nb] === s) {
          direct++;
          expect(closeRel(crew.seconds[nb]!, out), `crew neighbour ${nb}`).toBe(true);
        }
        if (hab.prev[nb] === s) {
          direct++;
          expect(closeRel(hab.seconds[nb]!, back), `hab neighbour ${nb}`).toBe(true);
        }
      }
    }
    expect(direct).toBeGreaterThanOrEqual(8);
  });

  it("a no-data slope_max (255) on a passable cell gets no caution multiplier, as v1 decodes it to null and uses 0", () => {
    const fx = havenFlat();
    const g = geoOf(fx.grid);
    const k = mustCell(g, { x_m: 3 * g.cell_m, y_m: 0 });
    fx.grid.slopeMax[k] = 255;
    const step = g.cell_m / v0;
    const out = crewTimeField(fx.grid, fx.shape.hab, scenario, Infinity);
    expect(out.seconds[k]).toBeCloseTo(3 * step, 6);
    expect(out.seconds[k]).toBeCloseTo(v1StepSeconds(fx.grid, scenario, mustCell(g, { x_m: 2 * g.cell_m, y_m: 0 }), k) + 2 * step, 6);
  });
});

// ---------------------------------------------------------------------------
// Deferred (it.todo instead of coverage targets, CLAUDE.md section 6)
// ---------------------------------------------------------------------------

describe("deferred", () => {
  it.todo("real grid: full-grid field in 2 s or less on the weakest laptop (NFR-02) is the T05b.05 benchmark, bench/haven.bench.ts");
});
