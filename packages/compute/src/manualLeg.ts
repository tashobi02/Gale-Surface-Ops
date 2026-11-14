/**
 * Manual-leg fallback (docs/tasks TASK-05 T05.30, N-25; 01-contract §7; BD-150): measure and check a hand-drawn leg.
 * When auto-routing is unavailable the planner lets the user draw a polyline between two waypoints. This walks the
 * polyline through the routing grid (`cellsAlongPath`), measures it exactly as the router's legs are measured (`toLeg`)
 * and checks every cell it crosses against the scenario's limits. Pure and deterministic; projected metres only (Mars
 * CRS, no Earth radius).
 *
 * Rule (BD-150): a leg is OK only if every cell it crosses is passable at the scenario's hard slope limit (no no-data,
 * no HARD_HAZARD flag, slope not over the limit) and the polyline stays on the grid to its last vertex. Otherwise it is a
 * NO_ROUTE leg: START_BLOCKED when the first cell cannot be walked (or the polyline starts off the grid), END_BLOCKED when
 * the last cell cannot be walked or the polyline leaves the grid, otherwise the barrier kind of the first blocked cell
 * (no-data, then hazard, then slope). `nearest_reachable` is the centre of the last walkable cell before the block.
 * Warnings are the plan checks that apply to one leg (collectWarnings, leg index 0); the whole-plan EVA duration and
 * walkback checks are not raised for a single leg, the plan result raises them.
 */
import { FLAG_BITS, type Leg, type MissionScenario, type NoRouteLeg, type NoRouteReason, type Warning } from "@marswalk/protocol";
import { cellIndex, centreOfCell, decodeSlopeDeg, type LoadedGrid } from "./grid";
import { toLeg } from "./leg";
import { cellsAlongPath } from "./paths";
import { isCellPassable } from "./route";
import { collectWarnings } from "./warnings";

export interface ManualLegResultData {
  leg: Leg;
  warnings: Warning[];
}

/** Why a cell cannot be walked: no-data, then hazard, then slope (the router's passability, route.ts). */
function barrierOf(grid: LoadedGrid, cell: number): NoRouteReason {
  if ((grid.flags[cell]! & (1 << FLAG_BITS.NO_DATA)) !== 0 || Number.isNaN(grid.elevation[cell]) || decodeSlopeDeg(grid.slopeP90[cell]!) === null) {
    return "DISCONNECTED_BY_NODATA";
  }
  if ((grid.flags[cell]! & (1 << FLAG_BITS.HARD_HAZARD)) !== 0) return "DISCONNECTED_BY_HAZARD";
  return "DISCONNECTED_BY_SLOPE";
}

/**
 * Validate a hand-drawn leg from waypoint `fromId` to `toId` along `vertices` (working-projection metres).
 * Throws RangeError for fewer than two vertices or a non-finite coordinate (the worker handler answers INVALID_INPUT
 * before it gets here).
 */
export function validateManualLeg(
  grid: LoadedGrid,
  scenario: MissionScenario,
  fromId: string,
  toId: string,
  vertices: readonly (readonly [number, number])[],
): ManualLegResultData {
  if (vertices.length < 2) throw new RangeError("validateManualLeg: a leg needs at least two vertices");
  for (const [x, y] of vertices) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError("validateManualLeg: every vertex must be finite");
  }
  const limit = scenario.hard_slope_limit_deg;
  const cells = cellsAlongPath(grid, vertices);
  const last = vertices[vertices.length - 1]!;
  const blockedAt = cells.findIndex((cell) => !isCellPassable(grid, cell, limit));

  let reason: NoRouteReason | undefined;
  let before = -1; // index of the last walkable cell before the block
  if (cells.length === 0) {
    reason = "START_BLOCKED";
  } else if (blockedAt === 0) {
    reason = "START_BLOCKED";
  } else if (blockedAt > 0) {
    reason = blockedAt === cells.length - 1 && cells[cells.length - 1] === cellIndex(grid, last[0], last[1]) ? "END_BLOCKED" : barrierOf(grid, cells[blockedAt]!);
    before = blockedAt - 1;
  } else if (vertices.some(([x, y]) => cellIndex(grid, x, y) === null) || cells[cells.length - 1] !== cellIndex(grid, last[0], last[1])) {
    reason = "END_BLOCKED"; // the polyline leaves the grid before its last vertex
    before = cells.length - 1;
  }

  if (reason !== undefined) {
    const leg: NoRouteLeg = { from: fromId, to: toId, status: "NO_ROUTE", reason };
    if (before >= 0) {
      const [x_m, y_m] = centreOfCell(grid.meta, cells[before]!);
      leg.nearest_reachable = { x_m, y_m };
    }
    return { leg, warnings: collectWarnings([leg], scenario, undefined, 0, grid, undefined, [undefined]) };
  }

  const leg = toLeg(grid, fromId, toId, { status: "OK", cells }, scenario);
  const warnings = collectWarnings([leg], scenario, undefined, 0, grid, undefined, [cells]).filter(
    (w) => w.code !== "EVA_DURATION_EXCEEDED" && w.code !== "WALKBACK_EXCEEDED",
  );
  return { leg, warnings };
}
