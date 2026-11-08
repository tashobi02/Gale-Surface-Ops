/**
 * Time to safe haven (docs/specs/02 §D.8; FR-39). Pure, deterministic; sim time in seconds.
 * TASK-05b. Signatures frozen by T05b.01 (contract C15); later changes are `contract-change:` subtasks.
 * All positions are working-projection metres (`x_m`, `y_m`); a cell index is row-major, row 0 = north.
 */
import { FLAG_BITS } from "@marswalk/protocol";
import type { MissionScenario, ParamSet, Provenance } from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";

/**
 * Time to enter the hab and be sheltered: 5 min (02 §D.8 `t_ingress`, labelled **Assumed**).
 * A named constant because no ParamSet kind has a hab-ingress key. The vehicle's ingress comes from
 * the rover ParamSet (`ingress_min` × 60).
 * TODO(decision): 05 says every non-data number lives in a ParamSet, so a `hab_ingress_min` key
 * may be wanted (in `suit` or `link`?). Raised in the T05b.01 PR; 05 is not edited here.
 */
export const HAB_INGRESS_S = 5 * 60;

/** Cell size of the vehicle time field, an aggregate of the 5 m routing grid (02 §D.8). */
export const VEHICLE_GRID_CELL_M = 10;

/** Spacing of the samples along a planned route for the planning haven time (02 §D.8). */
export const HAVEN_SAMPLE_SPACING_M = 50;

/** Radius around a route sample searched for a rendezvous cell in the planning form (02 §D.8). */
export const HAVEN_PLANNING_RADIUS_M = 300;

/**
 * Label of the planning form `havenAlongRoute`: `modelled (approximation)` (02 §D.8). Additive export,
 * Proposed by T05b.03 so the label is testable and the UI can show it from one place. Frozen. `havenAlongRoute`
 * returns a bare `number[]`, so the caller (T23.03 / the planner UI) applies this label to the values it shows.
 */
export const HAVEN_PLANNING_LABEL: Readonly<{ provenance: Provenance; note: string }> = Object.freeze({
  provenance: "modelled" as Provenance,
  note: "approximation",
});

/** Seconds to become sheltered once at the hab and once at the vehicle (02 §D.8). */
export interface HavenIngress {
  hab_s: number;
  vehicle_s: number;
}

/**
 * A full-grid travel-time field, row-major, row 0 = north (02 §D.8, §D.10).
 * `seconds[i]` is the travel time of cell `i` from the field's start (for a hab field, to the hab),
 * `Infinity` where unreachable. `prev[i]` is the predecessor cell index on the least-time path,
 * -1 for the start cell and for unreached cells ("paths by back-pointers", §D.10).
 * `prev` points toward the field's start, so following it from a cell walks back to the start.
 */
export interface TimeField {
  /** Cell size in metres: the routing grid's 5 m for crew and hab fields, VEHICLE_GRID_CELL_M for vehicles. */
  cell_m: number;
  width: number;
  height: number;
  /** Projected metres of the top-left corner, as `RoutingGrid.origin_m`. */
  origin_m: [number, number];
  /** Seconds per cell; Infinity = unreachable. */
  seconds: Float64Array;
  /** Predecessor cell index; -1 = start or unreached. */
  prev: Int32Array;
}

/** The live haven result, mapped by the engine into `Crew.haven` (05 Crew; minutes = haven_s / 60). */
export interface LiveHaven {
  /** min(haven_hab, haven_veh) + ingress, in seconds. */
  haven_s: number;
  kind: "hab" | "vehicle";
  target_x_m: number;
  target_y_m: number;
}

// ---------------------------------------------------------------------------
// Private helpers. They do not call route.ts, timeModel.ts or grid.ts (still stubs: T05.16, T05.18,
// T05.22); each repeats one spec formula and names its section.
// TODO(TASK-05): replace cellOf / the slope tests / the suited step with cellIndex / decodeSlopeDeg / stepTimeH
// once T05.16 and T05.22 merge, and add the parity test (a habTimeField step equals stepTimeH x 3600).
// ---------------------------------------------------------------------------

/** 02 §D.2 step-cost multipliers, labelled Assumed there ("configurable"). Private: T05.18 will export its own. */
const CAUTION_COST_MULT = 1.5;
const LOW_TI_COST_MULT = 1.3;

const NO_DATA_BIT = 1 << FLAG_BITS.NO_DATA;
const HARD_HAZARD_BIT = 1 << FLAG_BITS.HARD_HAZARD;
const LOW_TI_BIT = 1 << FLAG_BITS.LOW_TI;

/** 05 §C RoutingGrid: slope u8 = degrees x 4, 255 = no data. */
const SLOPE_NO_DATA = 255;

/** 05 §E.1: i = floor((oy - y) / c), j = floor((x - ox) / c); -1 outside (NaN is outside). */
function cellOf(origin: readonly [number, number], cell_m: number, width: number, height: number, x_m: number, y_m: number): number {
  const i = Math.floor((origin[1] - y_m) / cell_m);
  const j = Math.floor((x_m - origin[0]) / cell_m);
  if (!(i >= 0 && j >= 0 && i < height && j < width)) return -1;
  return i * width + j;
}

/** 02 §D.2 impassability for the suited crew, plus a NaN elevation (DEM no-data becomes NaN, CLAUDE.md section 2). */
function suitedBlocked(grid: LoadedGrid, scenario: MissionScenario, k: number): boolean {
  const p90 = grid.slopeP90[k]!;
  return (
    (grid.flags[k]! & (NO_DATA_BIT | HARD_HAZARD_BIT)) !== 0 ||
    p90 === SLOPE_NO_DATA ||
    p90 / 4 > scenario.hard_slope_limit_deg ||
    Number.isNaN(grid.elevation[k])
  );
}

/** Per-cell data the Dijkstra kernel reads. `mult[k]` is defined for every cell, including impassable ones. */
interface Lattice {
  width: number;
  height: number;
  cell_m: number;
  origin_m: [number, number];
  z: Float64Array;
  /** 1 = may be entered, 0 = not. */
  pass: Uint8Array;
  /** Step-cost multiplier of the cell entered. */
  mult: Float64Array;
}

/**
 * Per-cell arrays are rebuilt only when needed: cached per grid object, then per scenario / ParamSet object
 * (nested WeakMaps, so nothing is kept alive). The entry also records the numbers it was built from, so editing a
 * scenario in place is noticed. A grid is treated as immutable once it has been passed to this module: editing its
 * arrays afterwards is not detected. The cached arrays are never handed out (fields copy what they need).
 */
interface SuitedEntry {
  hard: number;
  caution: number;
  lat: Lattice;
}
const suitedCache = new WeakMap<LoadedGrid, WeakMap<MissionScenario, SuitedEntry>>();

function suitedLattice(grid: LoadedGrid, scenario: MissionScenario): Lattice {
  let per = suitedCache.get(grid);
  if (per === undefined) {
    per = new WeakMap();
    suitedCache.set(grid, per);
  }
  const hit = per.get(scenario);
  if (hit !== undefined && hit.hard === scenario.hard_slope_limit_deg && hit.caution === scenario.caution_slope_deg) return hit.lat;
  const lat = buildSuitedLattice(grid, scenario);
  per.set(scenario, { hard: scenario.hard_slope_limit_deg, caution: scenario.caution_slope_deg, lat });
  return lat;
}

function buildSuitedLattice(grid: LoadedGrid, scenario: MissionScenario): Lattice {
  const { width, height, cell_m, origin_m } = grid.meta;
  const n = width * height;
  const pass = new Uint8Array(n);
  const mult = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    pass[k] = suitedBlocked(grid, scenario, k) ? 0 : 1;
    mult[k] = (grid.slopeMax[k]! / 4 > scenario.caution_slope_deg ? CAUTION_COST_MULT : 1) * ((grid.flags[k]! & LOW_TI_BIT) !== 0 ? LOW_TI_COST_MULT : 1);
  }
  return { width, height, cell_m, origin_m: [origin_m[0], origin_m[1]], z: new Float64Array(grid.elevation), pass, mult };
}

function suitedInvSpeed(scenario: MissionScenario): number {
  const kmh = scenario.suited_flat_speed_kmh;
  if (!(Number.isFinite(kmh) && kmh > 0)) throw new RangeError(`MissionScenario.suited_flat_speed_kmh must be a finite number > 0, got ${kmh}`);
  return 3600 / (kmh * 1000);
}

// -- Indexed binary min-heap over cell indices, ordered by (seconds, index) ---------------------------------

function siftUp(heap: Int32Array, pos: Int32Array, sec: Float64Array, start: number): void {
  let k = start;
  const item = heap[k]!;
  const key = sec[item]!;
  while (k > 0) {
    const parent = (k - 1) >> 1;
    const pi = heap[parent]!;
    const pk = sec[pi]!;
    if (pk < key || (pk === key && pi < item)) break;
    heap[k] = pi;
    pos[pi] = k;
    k = parent;
  }
  heap[k] = item;
  pos[item] = k;
}

function siftDown(heap: Int32Array, pos: Int32Array, sec: Float64Array, start: number, size: number): void {
  let k = start;
  const item = heap[k]!;
  const key = sec[item]!;
  for (;;) {
    let child = 2 * k + 1;
    if (child >= size) break;
    let ci = heap[child]!;
    let ck = sec[ci]!;
    const right = child + 1;
    if (right < size) {
      const ri = heap[right]!;
      const rk = sec[ri]!;
      if (rk < ck || (rk === ck && ri < ci)) {
        child = right;
        ci = ri;
        ck = rk;
      }
    }
    if (key < ck || (key === ck && item < ci)) break;
    heap[k] = ci;
    pos[ci] = k;
    k = child;
  }
  heap[k] = item;
  pos[item] = k;
}

// 8 neighbours in ascending cell-index order (NFR-06): -w-1, -w, -w+1, -1, +1, w-1, w, w+1.
const NB_DROW = Int8Array.of(-1, -1, -1, 0, 0, 1, 1, 1);
const NB_DCOL = Int8Array.of(-1, 0, 1, -1, 1, -1, 0, 1);
const NB_DIAGONAL = Uint8Array.of(1, 0, 1, 0, 0, 1, 0, 1);

const MODE_SUITED = 0;
const MODE_VEHICLE = 1;

interface RawField {
  seconds: Float64Array;
  prev: Int32Array;
}

/**
 * Dijkstra over an 8-connected lattice with an indexed heap (decrease-key, no duplicate entries), ties by
 * cell index. `reverse` computes the time to walk TO `start` (gradient sign flipped, 02 §D.8); the multiplier is
 * charged on the cell entered in the direction of travel. A candidate time above `limit_s` is never recorded,
 * so a bounded field is already consistent. The start is seeded at 0 even if it is impassable.
 * MODE_SUITED: p0 = seconds per metre at the flat speed. MODE_VEHICLE: p0 = flat speed in m/s, p1 = hard slope
 * limit in degrees, p2 = min_speed_frac.
 */
function dijkstra(lat: Lattice, start: number, reverse: boolean, limit_s: number, mode: number, p0: number, p1: number, p2: number): RawField {
  const { width: w, height: h, z, pass, mult } = lat;
  const n = w * h;
  const sec = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new Int32Array(n);
  const pos = new Int32Array(n).fill(-1); // -1 never queued, -2 settled
  const dOrth = lat.cell_m;
  const dDiag = lat.cell_m * Math.SQRT2;
  const RAD_TO_DEG = 180 / Math.PI;
  sec[start] = 0;
  heap[0] = start;
  pos[start] = 0;
  let size = 1;
  while (size > 0) {
    const u = heap[0]!;
    pos[u] = -2;
    size--;
    if (size > 0) {
      const last = heap[size]!;
      heap[0] = last;
      pos[last] = 0;
      siftDown(heap, pos, sec, 0, size);
    }
    const tu = sec[u]!;
    const row = (u / w) | 0;
    const col = u - row * w;
    const zu = z[u]!;
    const mu = mult[u]!;
    for (let e = 0; e < 8; e++) {
      const nr = row + NB_DROW[e]!;
      const nc = col + NB_DCOL[e]!;
      if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
      const nb = nr * w + nc;
      if (pass[nb] === 0 || pos[nb] === -2) continue;
      const d = NB_DIAGONAL[e] === 1 ? dDiag : dOrth;
      let dz: number;
      let m: number;
      if (reverse) {
        dz = zu - z[nb]!; // travel nb -> u
        m = mu;
      } else {
        dz = z[nb]! - zu; // travel u -> nb
        m = mult[nb]!;
      }
      if (dz !== dz) continue; // NaN elevation on the start cell
      let step: number;
      if (mode === MODE_SUITED) {
        // 02 §D.2: L / v(S) * m with v(S) = v0 exp(-3.5 |S + 0.05|) / exp(-0.175), rearranged to one exp.
        step = dz === 0 ? d * p0 * m : Math.sqrt(d * d + dz * dz) * p0 * Math.exp(3.5 * Math.abs(dz / d + 0.05) - 0.175) * m;
      } else {
        // 02 §D.9: v = v_max * max(min_speed_frac, 1 - |theta| / theta_lim), theta from the directional gradient.
        let f = 1;
        if (dz !== 0) {
          f = 1 - (Math.atan(Math.abs(dz) / d) * RAD_TO_DEG) / p1;
          if (f < p2) f = p2;
        }
        step = (Math.sqrt(d * d + dz * dz) / (p0 * f)) * m;
      }
      const t = tu + step;
      if (t > limit_s || !(t < sec[nb]!)) continue;
      sec[nb] = t;
      prev[nb] = u;
      if (pos[nb] === -1) {
        heap[size] = nb;
        pos[nb] = size;
        size++;
        siftUp(heap, pos, sec, size - 1);
      } else {
        siftUp(heap, pos, sec, pos[nb]!);
      }
    }
  }
  return { seconds: sec, prev };
}

function toField(lat: Lattice, raw: RawField): TimeField {
  return { cell_m: lat.cell_m, width: lat.width, height: lat.height, origin_m: [lat.origin_m[0], lat.origin_m[1]], seconds: raw.seconds, prev: raw.prev };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/**
 * Reverse Dijkstra from the hab entrance over the suited cost (v1 D.2 step cost with the
 * gradient sign flipped, because travel is toward the hab). One field per plan. TASK-05b.
 * Throws RangeError when the hab is outside the grid (Proposed). The hab cell is the start (seconds 0) even if
 * its own flags mark it impassable (Proposed): the entrance footprint may be flagged on the real grid.
 */
export function habTimeField(grid: LoadedGrid, hab: { x_m: number; y_m: number }, scenario: MissionScenario): TimeField {
  const invV0 = suitedInvSpeed(scenario);
  const { width, height, cell_m, origin_m } = grid.meta;
  const start = cellOf(origin_m, cell_m, width, height, hab.x_m, hab.y_m);
  if (start < 0) throw new RangeError(`habTimeField: the hab (${hab.x_m}, ${hab.y_m}) is outside the grid`);
  const lat = suitedLattice(grid, scenario);
  return toField(lat, dijkstra(lat, start, true, Infinity, MODE_SUITED, invV0, 0, 0));
}

interface VehicleParams {
  vv: number;
  hardDeg: number;
  minFrac: number;
  lowTi: number;
}

function ensureVehicleKind(params: ParamSet): void {
  if (params.kind !== "pressurized_rover" && params.kind !== "utility_rover") {
    throw new TypeError(`ParamSet "${params.param_set_id}": kind must be pressurized_rover or utility_rover, got "${params.kind}"`);
  }
}

function paramNumber(params: ParamSet, key: string, ok: (v: number) => boolean, rule: string): number {
  const v = params.values[key];
  if (typeof v !== "number" || !Number.isFinite(v) || !ok(v)) {
    throw new RangeError(`ParamSet "${params.param_set_id}": ${key} must be a finite number ${rule}, got ${String(v)}`);
  }
  return v;
}

const hardSlopeOk = (v: number): boolean => v > 0 && v <= 90;

function readVehicleParams(params: ParamSet): VehicleParams {
  ensureVehicleKind(params);
  return {
    vv: (paramNumber(params, "flat_speed_kmh", (v) => v > 0, "> 0") * 1000) / 3600,
    hardDeg: paramNumber(params, "hard_slope_deg", hardSlopeOk, "in (0, 90]"),
    minFrac: paramNumber(params, "min_speed_frac", (v) => v > 0 && v <= 1, "in (0, 1]"),
    lowTi: paramNumber(params, "low_ti_cost", (v) => v > 0, "> 0"),
  };
}

/**
 * Aggregate the routing grid to the vehicle lattice (Proposed, answers T05b.01 open question 4):
 * k = VEHICLE_GRID_CELL_M / cell_m children per side (a grid already at or above 10 m is its own aggregate);
 * the lattice shares the grid's origin and has ceil(W/k) x ceil(H/k) cells, edge parents using the children they
 * have. A parent is passable only if all its children are `vehiclePassable` (a 5 m gap is closed for the rover,
 * the safe direction); elevation is the mean of the children, LOW_TI if any child is.
 */
function vehicleLattice(grid: LoadedGrid, vp: VehicleParams, childPass: Uint8Array): Lattice {
  const { width: w, height: h, cell_m, origin_m } = grid.meta;
  let k = 1;
  if (cell_m < VEHICLE_GRID_CELL_M) {
    k = Math.round(VEHICLE_GRID_CELL_M / cell_m);
    if (Math.abs(k * cell_m - VEHICLE_GRID_CELL_M) > 1e-9) {
      throw new RangeError(`vehicleTimeField: the grid cell ${cell_m} m does not divide the ${VEHICLE_GRID_CELL_M} m vehicle cell`);
    }
  }
  const w2 = Math.ceil(w / k);
  const h2 = Math.ceil(h / k);
  const z = new Float64Array(w2 * h2);
  const pass = new Uint8Array(w2 * h2);
  const mult = new Float64Array(w2 * h2);
  for (let I = 0; I < h2; I++) {
    const i1 = Math.min(h, I * k + k);
    for (let J = 0; J < w2; J++) {
      const j1 = Math.min(w, J * k + k);
      let sum = 0;
      let count = 0;
      let all = true;
      let lowTi = false;
      for (let i = I * k; i < i1; i++) {
        for (let j = J * k; j < j1; j++) {
          const c = i * w + j;
          sum += grid.elevation[c]!;
          count++;
          if (childPass[c] === 0) all = false;
          if ((grid.flags[c]! & LOW_TI_BIT) !== 0) lowTi = true;
        }
      }
      const p = I * w2 + J;
      z[p] = sum / count;
      pass[p] = all ? 1 : 0;
      mult[p] = lowTi ? vp.lowTi : 1;
    }
  }
  return { width: w2, height: h2, cell_m: k * cell_m, origin_m: [origin_m[0], origin_m[1]], z, pass, mult };
}

/**
 * Forward Dijkstra from a vehicle's position over its own cost (02 §D.9), on a
 * VEHICLE_GRID_CELL_M aggregate grid for speed. Reads `flat_speed_kmh`, `hard_slope_deg`,
 * `min_speed_frac` and `low_ti_cost` from the rover ParamSet. TASK-05b.
 * Proposed: theta is the directional gradient angle between lattice cell centres; no caution multiplier (02 §D.9
 * gives none); the start is seeded even if impassable; a start outside the grid throws RangeError.
 */
export function vehicleTimeField(grid: LoadedGrid, from: { x_m: number; y_m: number }, params: ParamSet): TimeField {
  const vp = readVehicleParams(params);
  const lat = cachedVehicleLattice(grid, params, vp);
  const start = cellOf(lat.origin_m, lat.cell_m, lat.width, lat.height, from.x_m, from.y_m);
  if (start < 0) throw new RangeError(`vehicleTimeField: the vehicle (${from.x_m}, ${from.y_m}) is outside the grid`);
  return toField(lat, dijkstra(lat, start, false, Infinity, MODE_VEHICLE, vp.vv, vp.hardDeg, vp.minFrac));
}

/**
 * Bounded suited Dijkstra from a crew position, stopped at `limit_s` (about 308 k expansions at 5 m for the
 * default 30 min, not the "~50 k" of 02 §D.8: see the T05b.04 note). The caller passes
 * `limit_s = scenario.max_haven_min * 60`; the 30 min haven rule is user data. TASK-05b.
 * Throws RangeError for a negative or NaN limit; a start outside the grid gives an all-Infinity field (Proposed).
 */
export function crewTimeField(grid: LoadedGrid, from: { x_m: number; y_m: number }, scenario: MissionScenario, limit_s: number): TimeField {
  if (!(limit_s >= 0)) throw new RangeError(`crewTimeField: limit_s must be >= 0, got ${limit_s}`);
  const invV0 = suitedInvSpeed(scenario);
  const lat = suitedLattice(grid, scenario);
  const start = cellOf(lat.origin_m, lat.cell_m, lat.width, lat.height, from.x_m, from.y_m);
  if (start < 0) {
    const n = lat.width * lat.height;
    return toField(lat, { seconds: new Float64Array(n).fill(Infinity), prev: new Int32Array(n).fill(-1) });
  }
  return toField(lat, dijkstra(lat, start, false, limit_s, MODE_SUITED, invV0, 0, 0));
}

/**
 * Per-cell vehicle passability on the routing grid (5 m, indexed like `grid`): 1 = passable,
 * 0 = not. Slope against the rover ParamSet `hard_slope_deg` plus the grid flags (02 §D.9). Used by
 * `rendezvous` and by the loader's "vehicle start passable for its kind" check (05 §E.7). TASK-05b.
 */
export function vehiclePassable(grid: LoadedGrid, params: ParamSet): Uint8Array {
  return sharedVehiclePassable(grid, params).slice(); // the caller owns the copy; the cached mask stays untouched
}

interface VehicleEntry {
  hard: number;
  lowTi: number | null;
  pass: Uint8Array;
  lat: Lattice | null;
}
const vehicleCache = new WeakMap<LoadedGrid, WeakMap<ParamSet, VehicleEntry>>();

function vehicleEntry(grid: LoadedGrid, params: ParamSet, hard: number): VehicleEntry {
  let per = vehicleCache.get(grid);
  if (per === undefined) {
    per = new WeakMap();
    vehicleCache.set(grid, per);
  }
  const hit = per.get(params);
  if (hit !== undefined && hit.hard === hard) return hit;
  const entry: VehicleEntry = { hard, lowTi: null, pass: computeVehiclePassable(grid, hard), lat: null };
  per.set(params, entry);
  return entry;
}

function sharedVehiclePassable(grid: LoadedGrid, params: ParamSet): Uint8Array {
  ensureVehicleKind(params);
  return vehicleEntry(grid, params, paramNumber(params, "hard_slope_deg", hardSlopeOk, "in (0, 90]")).pass;
}

function cachedVehicleLattice(grid: LoadedGrid, params: ParamSet, vp: VehicleParams): Lattice {
  const entry = vehicleEntry(grid, params, vp.hardDeg);
  if (entry.lat === null || entry.lowTi !== vp.lowTi) {
    entry.lat = vehicleLattice(grid, vp, entry.pass);
    entry.lowTi = vp.lowTi;
  }
  return entry.lat;
}

function computeVehiclePassable(grid: LoadedGrid, hard: number): Uint8Array {
  const n = grid.meta.width * grid.meta.height;
  const out = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const p90 = grid.slopeP90[k]!;
    const blocked = (grid.flags[k]! & (NO_DATA_BIT | HARD_HAZARD_BIT)) !== 0 || p90 === SLOPE_NO_DATA || p90 / 4 > hard || Number.isNaN(grid.elevation[k]);
    out[k] = blocked ? 0 : 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading fields
// ---------------------------------------------------------------------------

/**
 * Travel time of the cell containing (x_m, y_m), in seconds; Infinity outside the field or where
 * unreachable. The live form reads `T_hab(p)` with this (02 §D.8). TASK-05b.
 */
export function timeAt(field: TimeField, x_m: number, y_m: number): number {
  const k = cellOf(field.origin_m, field.cell_m, field.width, field.height, x_m, y_m);
  return k < 0 ? Infinity : field.seconds[k]!;
}

function centreOfCell(field: TimeField, k: number): [number, number] {
  const row = Math.floor(k / field.width);
  const col = k - row * field.width;
  // "+ 0" turns a negative zero into 0.
  return [field.origin_m[0] + (col + 0.5) * field.cell_m + 0, field.origin_m[1] - (row + 0.5) * field.cell_m + 0];
}

/**
 * Least-time path by back-pointers: cell centres in projected metres, ordered from the cell
 * containing (x_m, y_m) back to the field's start cell (02 §D.10), i.e. cell first, start last. Empty if the cell is outside or
 * unreachable. For a hab field this is the walk to the hab (`path_preview`). TASK-05b.
 * A back-pointer cycle (a corrupt field) gives an empty path (Proposed).
 */
export function pathTo(field: TimeField, x_m: number, y_m: number): [number, number][] {
  let k = cellOf(field.origin_m, field.cell_m, field.width, field.height, x_m, y_m);
  if (k < 0 || !(field.seconds[k]! < Infinity)) return [];
  const out: [number, number][] = [];
  const limit = field.seconds.length;
  while (k >= 0) {
    if (out.length >= limit) return [];
    out.push(centreOfCell(field, k));
    k = field.prev[k]!;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Live and planning forms
// ---------------------------------------------------------------------------

function checkIngress(ingress: HavenIngress, who: string): void {
  for (const key of ["hab_s", "vehicle_s"] as const) {
    const v = ingress[key];
    if (!(Number.isFinite(v) && v >= 0)) throw new RangeError(`${who}: ingress.${key} must be a finite number >= 0, got ${v}`);
  }
}

function sameGeometry(a: TimeField, b: TimeField): boolean {
  return a.width === b.width && a.height === b.height && a.cell_m === b.cell_m && a.origin_m[0] === b.origin_m[0] && a.origin_m[1] === b.origin_m[1];
}

/**
 * The live haven time for one crew member (02 §D.8, "live form"):
 * min(haven_hab, haven_veh) + ingress, with haven_hab = T_hab(crew_at) + ingress.hab_s and
 * haven_veh = the best of max(T_crew(q), T_veh(q)) over cells q that are `passable` (null when
 * there is no vehicle) + ingress.vehicle_s. "refuge" is out of scope (T2).
 * Returns null when no haven can be reached (both times Infinity); the engine then reports
 * `haven_min` null, as `ALERT_RAISED` does. Proposed tie rule: when the hab and vehicle times are
 * equal the hab wins (NFR-06, deterministic). The engine divides `haven_s` by 60 for
 * `Crew.haven.minutes`. `crew_at` is the crew position, which must be the start of the `crew`
 * field; it is passed so T_hab can be read without scanning the crew field for its start cell. TASK-05b.
 *
 * The meeting cell q* minimises max(T_crew, T_veh), ties by smaller T_crew, then by cell index (02 §D.10 rule,
 * shared with `rendezvous`). T_veh (10 m) is read at the 10 m cell containing the centre of the 5 m cell q.
 * Throws RangeError when `hab` and `crew` differ in width, height, cell size or origin, when `passable` differs in
 * length (a bare array has no geometry to compare), or when an ingress value is NaN, negative or not finite.
 */
export function liveHaven(
  hab: TimeField,
  crew: TimeField,
  vehicle: TimeField | null,
  passable: Uint8Array | null,
  ingress: HavenIngress,
  crew_at: { x_m: number; y_m: number },
): LiveHaven | null {
  checkIngress(ingress, "liveHaven");
  const n = crew.seconds.length;
  if (!sameGeometry(hab, crew)) throw new RangeError("liveHaven: the hab and crew fields differ in width, height, cell size or origin");
  if (hab.seconds.length !== n) throw new RangeError(`liveHaven: hab field has ${hab.seconds.length} cells, crew field ${n}`);
  if (passable !== null && passable.length !== n) throw new RangeError(`liveHaven: passable mask has ${passable.length} cells, crew field ${n}`);

  const habBranch = timeAt(hab, crew_at.x_m, crew_at.y_m) + ingress.hab_s;

  let bestKey = Infinity;
  let bestTc = Infinity;
  let bestQ = -1;
  if (vehicle !== null && passable !== null) {
    for (let q = 0; q < n; q++) {
      const tc = crew.seconds[q]!;
      // key >= tc, so a cell with tc >= bestKey cannot win (a tie on key needs a smaller tc than bestTc <= bestKey).
      if (!(tc < bestKey) || passable[q] !== 1) continue;
      const [cx, cy] = centreOfCell(crew, q);
      const tv = timeAt(vehicle, cx, cy);
      if (!(tv < Infinity)) continue;
      const key = tc > tv ? tc : tv;
      if (key < bestKey || (key === bestKey && tc < bestTc)) {
        bestKey = key;
        bestTc = tc;
        bestQ = q;
      }
    }
  }
  const vehBranch = bestQ >= 0 ? bestKey + ingress.vehicle_s : Infinity;

  if (!(habBranch < Infinity) && !(vehBranch < Infinity)) return null;
  if (habBranch <= vehBranch) {
    const path = pathTo(hab, crew_at.x_m, crew_at.y_m);
    const entrance: [number, number] = path.length > 0 ? path[path.length - 1]! : [crew_at.x_m, crew_at.y_m];
    return { haven_s: habBranch, kind: "hab", target_x_m: entrance[0], target_y_m: entrance[1] };
  }
  const [qx, qy] = centreOfCell(crew, bestQ);
  return { haven_s: vehBranch, kind: "vehicle", target_x_m: qx, target_y_m: qy };
}

/** Straight segment p -> q is walkable: sampled every half cell, every cell touched is passable for the suit. */
function segmentWalkable(grid: LoadedGrid, scenario: MissionScenario, px: number, py: number, qx: number, qy: number): boolean {
  const { width, height, cell_m, origin_m } = grid.meta;
  const steps = Math.max(1, Math.ceil(Math.hypot(qx - px, qy - py) / (cell_m / 2)));
  for (let s = 0; s <= steps; s++) {
    const x = px + ((qx - px) * s) / steps;
    const y = py + ((qy - py) * s) / steps;
    const k = cellOf(origin_m, cell_m, width, height, x, y);
    if (k < 0 || suitedBlocked(grid, scenario, k)) return false;
  }
  return true;
}

/**
 * Planning approximation along a route, every HAVEN_SAMPLE_SPACING_M:
 * min(T_hab, min over q within HAVEN_PLANNING_RADIUS_M of max(walk(p,q), T_veh(q))) + ingress,
 * with `ingress.hab_s` added to the hab branch and `ingress.vehicle_s` to the vehicle branch.
 * The vehicle branch only considers cells q "whose straight segment from p is passable" (02 §D.8),
 * which is why the 5 m `grid` (slope and flags) is an argument. Returns seconds per sample, in
 * sample order; Infinity if no haven is reachable. Labelled `modelled (approximation)`. TASK-05b.
 *
 * walk(p, q) = straight-line distance / v0; the segment is tested every half grid cell against the suited
 * impassability of 02 §D.2 (Proposed rule). The vehicle branch is skipped when `vehicle` is null or
 * `scenario.vehicle_available` is false. Throws RangeError for an ingress value that is NaN, negative or not finite.
 *
 * Unreachable samples are `Infinity` (the frozen return type is `number[]`). Callers must map `Infinity` to null
 * before a value reaches JSON or state (`JSON.stringify(Infinity)` is `null`, silently), and must apply
 * `HAVEN_PLANNING_LABEL` to what they show.
 */
export function havenAlongRoute(
  grid: LoadedGrid,
  samples: { x_m: number; y_m: number }[],
  hab: TimeField,
  vehicle: TimeField | null,
  scenario: MissionScenario,
  ingress: HavenIngress,
): number[] {
  checkIngress(ingress, "havenAlongRoute");
  const v0 = 1 / suitedInvSpeed(scenario); // metres per second; also validates the speed
  const veh = vehicle !== null && scenario.vehicle_available ? vehicle : null;
  const R = HAVEN_PLANNING_RADIUS_M;
  const out: number[] = [];
  for (const p of samples) {
    let best = timeAt(hab, p.x_m, p.y_m) + ingress.hab_s;
    if (veh !== null) {
      const vc = veh.cell_m;
      const j0 = Math.max(0, Math.floor((p.x_m - R - veh.origin_m[0]) / vc));
      const j1 = Math.min(veh.width - 1, Math.floor((p.x_m + R - veh.origin_m[0]) / vc));
      const i0 = Math.max(0, Math.floor((veh.origin_m[1] - (p.y_m + R)) / vc));
      const i1 = Math.min(veh.height - 1, Math.floor((veh.origin_m[1] - (p.y_m - R)) / vc));
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const tv = veh.seconds[i * veh.width + j]!;
          if (!(tv < Infinity)) continue;
          const qx = veh.origin_m[0] + (j + 0.5) * vc;
          const qy = veh.origin_m[1] - (i + 0.5) * vc;
          const d = Math.hypot(qx - p.x_m, qy - p.y_m);
          if (d > R) continue;
          const walk = d / v0;
          const cand = (walk > tv ? walk : tv) + ingress.vehicle_s;
          if (cand >= best) continue;
          if (!segmentWalkable(grid, scenario, p.x_m, p.y_m, qx, qy)) continue;
          best = cand;
        }
      }
    }
    out.push(best);
  }
  return out;
}
