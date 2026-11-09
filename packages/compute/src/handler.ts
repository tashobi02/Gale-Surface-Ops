/**
 * Pure request handler for the compute worker (docs/specs/02 §E.2).
 * FR-03, FR-06, FR-07, NFR-06. Implemented by TASK-05 (T05.26, T05.32).
 * Dispatches SAMPLE_POINT and COMPUTE_PLAN requests against a LoadedGrid.
 */
import type {
  ComputePlanRequest,
  PlanResult,
  PlanResultMessage,
  SamplePointRequest,
  SampleResult,
  WorkerError,
  WorkerRequest,
} from "@marswalk/protocol";
import type { LoadedGrid } from "./grid";
import { toLeg } from "./leg";
import { searchLeg } from "./route";
import { samplePoint } from "./sampling";
import { validateWorkerRequest } from "./validate";
import { maxWalkbackKm } from "./walkback";
import { collectWarnings, countStops, planStatus } from "./warnings";

export type PurePlanResultMessage = Omit<PlanResultMessage, "computed_utc" | "timing_ms">;
export type PureWorkerResponse = SampleResult | PurePlanResultMessage | WorkerError;

/**
 * Handle a worker request message against the currently loaded grid.
 * Pure function: takes the grid and the request, returns the response.
 * Optional maxExpansions parameter for testing TIMEOUT conditions.
 */
export function handleWorkerMessage(
  grid: LoadedGrid | null,
  request: WorkerRequest,
  maxExpansions?: number,
): PureWorkerResponse {
  try {
    if (request === null || typeof request !== "object" || Array.isArray(request) || typeof request.type !== "string") {
      return {
        type: "ERROR",
        request_id: typeof request?.request_id === "string" ? request.request_id : "unknown",
        code: "INVALID_INPUT",
        message: "Worker request must be an object with a type",
      };
    }
    if (grid === null) {
      return {
        type: "ERROR",
        request_id: request.request_id,
        code: "GRID_NOT_LOADED",
        message: "Routing grid failed checksum or did not load.",
      };
    }

    if (request.type === "SAMPLE_POINT" || request.type === "COMPUTE_PLAN") {
      const errors = validateWorkerRequest(request, grid);
      if (errors.length > 0) {
        return {
          type: "ERROR",
          request_id: typeof request.request_id === "string" ? request.request_id : "unknown",
          code: "INVALID_INPUT",
          message: errors.map((error) => `${error.field}: ${error.message}`).join("; "),
        };
      }
    }

    if (request.type === "SAMPLE_POINT") {
      return handleSamplePoint(grid, request);
    }

    if (request.type === "COMPUTE_PLAN") {
      return handleComputePlan(grid, request, maxExpansions);
    }

    return {
      type: "ERROR",
      request_id: (request as any).request_id ?? "unknown",
      code: "INTERNAL",
      message: `Unknown worker request type: ${(request as any).type}`,
    };
  } catch (err) {
    return {
      type: "ERROR",
      request_id: request?.request_id ?? "unknown",
      code: "INTERNAL",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function handleSamplePoint(
  grid: LoadedGrid,
  request: SamplePointRequest,
): SampleResult {
  const result = samplePoint(
    grid,
    request.x_m,
    request.y_m,
    request.snap_radius_m,
    request.hard_slope_limit_deg ?? 15,
  );

  return {
    type: "SAMPLE_RESULT",
    request_id: request.request_id,
    ...result,
  };
}

function handleComputePlan(
  grid: LoadedGrid,
  request: ComputePlanRequest,
  maxExpansions?: number,
): PurePlanResultMessage | WorkerError {
  const waypoints = request.waypoints;
  const loop = request.scenario.loop;

  // TODO(decision): Choose event-loop yielding or shared abort signalling for effective in-flight cancellation. Preserve the 02 §E.2 check interval of 50,000 expansions; stale-request rejection alone does not satisfy cancellation.
  // 2. Search legs between consecutive waypoints (+ return leg if loop)
  const legPairs: [typeof waypoints[0], typeof waypoints[0]][] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    legPairs.push([waypoints[i], waypoints[i + 1]]);
  }
  if (loop && waypoints.length >= 2) {
    legPairs.push([waypoints[waypoints.length - 1], waypoints[0]]);
  }

  const legs: PlanResult["legs"] = [];
  const cellPaths: (readonly number[] | undefined)[] = [];
  for (const [fromWp, toWp] of legPairs) {
    const search = searchLeg(
      grid,
      fromWp,
      toWp,
      request.scenario,
      maxExpansions,
    );
    if (search.status === "TIMEOUT") {
      return {
        type: "ERROR",
        request_id: request.request_id,
        code: "TIMEOUT",
        message: `Routing search timed out between ${fromWp.id} and ${toWp.id}`,
      };
    }
    const leg = toLeg(grid, fromWp.id, toWp.id, search, request.scenario);
    legs.push(leg);
    cellPaths.push(search.status === "OK" ? search.cells : undefined);
  }

  const hasNoRoute = legs.some((l) => l.status === "NO_ROUTE");

  // 3. Totals and walkback (null when PARTIAL per 02 §E.2)
  let totals: PlanResult["totals"] = null;
  let maxWbKm = 0;

  if (!hasNoRoute) {
    let totalDistM = 0;
    let totalWalkTimeMin = 0;
    let totalClimbM = 0;
    let totalDescentM = 0;
    let maxSlopeDeg = 0;

    const allCumDists: number[] = [0];
    let runningDist = 0;

    for (const leg of legs) {
      if (leg.status === "OK") {
        totalDistM += leg.distance_m;
        totalWalkTimeMin += leg.walk_time_min;
        totalClimbM += leg.climb_m;
        totalDescentM += leg.descent_m;
        if (leg.max_slope_deg > maxSlopeDeg) {
          maxSlopeDeg = leg.max_slope_deg;
        }

        if (leg.profile && leg.profile.dist_m) {
          for (let k = 1; k < leg.profile.dist_m.length; k++) {
            allCumDists.push(runningDist + leg.profile.dist_m[k]);
          }
        }
        runningDist += leg.distance_m;
      }
    }

    maxWbKm = maxWalkbackKm(allCumDists, loop);

    const stopCount = countStops(waypoints);
    const dwellMin = stopCount * (request.scenario.dwell_min_per_stop ?? 0);
    const evaTotalMin = totalWalkTimeMin + dwellMin;
    const evaMarginMin = request.scenario.max_eva_duration_h * 60 - evaTotalMin;

    totals = {
      distance_m: totalDistM,
      walk_time_min: totalWalkTimeMin,
      dwell_time_min: dwellMin,
      eva_total_min: evaTotalMin,
      eva_margin_min: evaMarginMin,
      climb_m: totalClimbM,
      descent_m: totalDescentM,
      max_slope_deg: maxSlopeDeg,
      max_walkback_km: maxWbKm,
    };
  }

  // TODO(decision): Complete C8 assembly into PlanResult after deciding the site coordinate, EnvConstant selection, PARTIAL-plan dose duration and darkness inputs. Until then, return the existing M3 empty timeline and omit conditions and radiation.
  const stops_timeline: PlanResult["stops_timeline"] = [];

  // 5. Warnings and plan status
  const warnings = collectWarnings(
    legs,
    request.scenario,
    undefined,
    maxWbKm,
    grid,
    waypoints,
    cellPaths,
  );
  const status = planStatus(legs, warnings);

  // TODO(decision): Define routing and estimates timing boundaries before reporting phase timings; this repair reports only measured total handler duration in timing_ms.total.
  return {
    type: "PLAN_RESULT",
    request_id: request.request_id,
    plan_revision: request.plan_revision,
    status,
    legs,
    totals,
    stops_timeline,
    warnings,
  };
}
