/**
 * Suit consumables (docs/specs/02 §D.14, §D.6; FR-35). O₂ fraction falls at
 * rate = P_met / P_ref / o2_nominal_h, with P_met for walking or resting (05 ParamSet kind `suit`).
 * TASK-05b (T05b.17). Pure; every coefficient from the suit ParamSet.
 */
import type { ParamSet } from "@marswalk/protocol";
import { cellIndex, type LoadedGrid } from "./grid";

function num(p: ParamSet, key: string): number {
  const value = (p.values as Record<string, unknown>)[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`consumables: ParamSet ${p.param_set_id} has no positive number ${key}`);
  return value;
}

/** O₂ fraction used per second at the given activity. */
function ratePerS(activity: "walking" | "resting", suit: ParamSet): number {
  const p_met = num(suit, activity === "walking" ? "p_walk_w" : "p_rest_w");
  return p_met / num(suit, "p_ref_w") / (num(suit, "o2_nominal_h") * 3600);
}

/** New O₂ fraction after dt_s seconds of the given activity; never below 0. */
export function stepO2(o2_frac: number, activity: "walking" | "resting", dt_s: number, suit: ParamSet): number {
  return Math.max(0, o2_frac - ratePerS(activity, suit) * dt_s);
}

/** Time left at the current activity, seconds. */
export function o2RemainingS(o2_frac: number, activity: "walking" | "resting", suit: ParamSet): number {
  return Math.max(0, o2_frac) / ratePerS(activity, suit);
}

/** Mars surface gravity, m/s²: the value of 02 §D.9 (and of the organiser guide's `climb_cost_j_per_m_kg`). */
export const MARS_GRAVITY_M_S2 = 3.721;

/**
 * Energy a utility rover uses on a path, Wh (02 §D.9 "Energy model"): E = P_base · t + m · g · Δh⁺ / η, with P_base
 * (`p_base_w`), m (`mass_kg`) and η (`climb_eff`) from the rover ParamSet. `path` lists the vertices in order, starting at the
 * rover; Δh⁺ is the sum of the positive elevation steps between consecutive vertices (grid elevation of the cell
 * containing each; descents add nothing). `duration_s` is the drive time, which the caller takes from compute's vehicle time
 * field, so there is one time model. Throws RangeError for a missing or non-positive coefficient, a negative or non-finite
 * duration, or a vertex off the grid or on a no-data cell. Pure.
 */
export function roverEnergyWh(path: readonly (readonly [number, number])[], duration_s: number, params: ParamSet, grid: LoadedGrid): number {
  const coefficient = (key: string): number => {
    const value = (params.values as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new RangeError(`roverEnergyWh: ParamSet ${params.param_set_id} has no positive number ${key}`);
    return value;
  };
  const pBase = coefficient("p_base_w");
  const mass = coefficient("mass_kg");
  const eff = coefficient("climb_eff");
  if (!Number.isFinite(duration_s) || duration_s < 0) throw new RangeError(`roverEnergyWh: duration_s must be a finite number >= 0, got ${duration_s}`);
  let climb_m = 0;
  let previous: number | null = null;
  for (const [x, y] of path) {
    const idx = cellIndex(grid, x, y);
    const z = idx === null ? Number.NaN : grid.elevation[idx]!;
    if (Number.isNaN(z)) throw new RangeError(`roverEnergyWh: the point (${x}, ${y}) is off the grid or has no elevation`);
    if (previous !== null && z > previous) climb_m += z - previous;
    previous = z;
  }
  return (pBase * duration_s + (mass * MARS_GRAVITY_M_S2 * climb_m) / eff) / 3600;
}

/**
 * Metabolic rate while walking (1,200 BTU/h = 351.7 W, Apollo 17 planning value; Assumed; 02 §D.6).
 * Illustrative planner constant (T18.05, N-24); never imported by routing, warnings, or handler.
 */
export const WALKING_METABOLIC_W = 351.7;

/**
 * Energy equivalent of O₂ at RER 0.85 (Weir relation; Assumed; 02 §D.6), in kJ/L.
 * Illustrative planner constant (T18.05, N-24); never imported by routing, warnings, or handler.
 */
export const O2_ENERGY_EQUIV_KJ_PER_L = 20.4;

/**
 * Illustrative O₂ consumption rate in L/min for a given metabolic power (02 §D.6; T18.05, N-24).
 * Pure planning estimate only: never used to block a route or raise a warning.
 */
export function o2LitresPerMinute(metabolicW: number): number {
  if (!Number.isFinite(metabolicW) || metabolicW < 0) {
    throw new RangeError(`o2LitresPerMinute: metabolicW must be a finite number >= 0, got ${metabolicW}`);
  }
  return (metabolicW * 60) / (O2_ENERGY_EQUIV_KJ_PER_L * 1000);
}
