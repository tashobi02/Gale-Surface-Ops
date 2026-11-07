/**
 * Time to safe haven (docs/specs/02 §D.8; FR-39). Pure, deterministic; sim time in seconds.
 * TASK-05b. Signatures frozen by T05b.01 (contract C15); later changes are `contract-change:` subtasks.
 * All positions are working-projection metres (`x_m`, `y_m`); a cell index is row-major, row 0 = north.
 */
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
 * Proposed by T05b.03 so the label is testable and the UI can show it from one place.
 */
export const HAVEN_PLANNING_LABEL: { provenance: Provenance; note: string } = { provenance: "modelled", note: "approximation" };

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

/**
 * Reverse Dijkstra from the hab entrance over the suited cost (v1 D.2 step cost with the
 * gradient sign flipped, because travel is toward the hab). One field per plan. TASK-05b.
 */
export function habTimeField(grid: LoadedGrid, hab: { x_m: number; y_m: number }, scenario: MissionScenario): TimeField {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Forward Dijkstra from a vehicle's position over its own cost (02 §D.9), on a
 * VEHICLE_GRID_CELL_M aggregate grid for speed. Reads `flat_speed_kmh`, `hard_slope_deg`,
 * `min_speed_frac` and `low_ti_cost` from the rover ParamSet. TASK-05b.
 */
export function vehicleTimeField(grid: LoadedGrid, from: { x_m: number; y_m: number }, params: ParamSet): TimeField {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Bounded suited Dijkstra from a crew position, stopped at `limit_s` (≈ 50 k expansions). The
 * caller passes `limit_s = scenario.max_haven_min * 60`; the 30 min haven rule is user data. TASK-05b.
 */
export function crewTimeField(grid: LoadedGrid, from: { x_m: number; y_m: number }, scenario: MissionScenario, limit_s: number): TimeField {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Planning approximation along a route, every HAVEN_SAMPLE_SPACING_M:
 * min(T_hab, min over q within HAVEN_PLANNING_RADIUS_M of max(walk(p,q), T_veh(q))) + ingress,
 * with `ingress.hab_s` added to the hab branch and `ingress.vehicle_s` to the vehicle branch.
 * The vehicle branch only considers cells q "whose straight segment from p is passable" (02 §D.8),
 * which is why the 5 m `grid` (slope and flags) is an argument. Returns seconds per sample, in
 * sample order; Infinity if no haven is reachable. Labelled `modelled (approximation)`. TASK-05b.
 */
export function havenAlongRoute(
  grid: LoadedGrid,
  samples: { x_m: number; y_m: number }[],
  hab: TimeField,
  vehicle: TimeField | null,
  scenario: MissionScenario,
  ingress: HavenIngress,
): number[] {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Per-cell vehicle passability on the routing grid (5 m, indexed like `grid`): 1 = passable,
 * 0 = not. Slope against the rover ParamSet `hard_slope_deg` plus the grid flags (02 §D.9). Used by
 * `rendezvous` and by the loader's "vehicle start passable for its kind" check (05 §E.7). TASK-05b.
 */
export function vehiclePassable(grid: LoadedGrid, params: ParamSet): Uint8Array {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Travel time of the cell containing (x_m, y_m), in seconds; Infinity outside the field or where
 * unreachable. The live form reads `T_hab(p)` with this (02 §D.8). TASK-05b.
 */
export function timeAt(field: TimeField, x_m: number, y_m: number): number {
  throw new Error("TODO(TASK-05b): not implemented");
}

/**
 * Least-time path by back-pointers: cell centres in projected metres, ordered from the cell
 * containing (x_m, y_m) back to the field's start cell (02 §D.10), i.e. cell first, start last. Empty if the cell is outside or
 * unreachable. For a hab field this is the walk to the hab (`path_preview`). TASK-05b.
 */
export function pathTo(field: TimeField, x_m: number, y_m: number): [number, number][] {
  throw new Error("TODO(TASK-05b): not implemented");
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
 */
export function liveHaven(
  hab: TimeField,
  crew: TimeField,
  vehicle: TimeField | null,
  passable: Uint8Array | null,
  ingress: HavenIngress,
  crew_at: { x_m: number; y_m: number },
): LiveHaven | null {
  throw new Error("TODO(TASK-05b): not implemented");
}
