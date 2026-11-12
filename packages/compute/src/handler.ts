/**
 * Pure request handler for the compute worker (docs/specs/02 §E.2).
 * FR-03, FR-06, FR-07, NFR-06. Implemented by TASK-05 (T05.26, T05.32).
 * Dispatches SAMPLE_POINT and COMPUTE_PLAN requests against a LoadedGrid.
 */
import type {
  ComputePlanRequest,
  EnvConstant,
  PlanResult,
  PlanResultMessage,
  SamplePointRequest,
  SampleResult,
  WorkerError,
  WorkerRequest,
} from "@marswalk/protocol";
import { assembleConditions } from "./conditions";
import type { LoadedGrid } from "./grid";
import { toLeg } from "./leg";
import { searchLeg } from "./route";
import { inverseEqc, samplePoint } from "./sampling";
import { evaTimeline } from "./timeModel";
import { validateWorkerRequest } from "./validate";
import { maxWalkbackKm } from "./walkback";
import { collectWarnings, countStops, planStatus } from "./warnings";

export type PurePlanResultMessage = Omit<PlanResultMessage, "computed_utc" | "timing_ms">;
export type PureWorkerResponse = SampleResult | PurePlanResultMessage | WorkerError;

/**
 * Phase timer the worker adapter injects to measure `timing_ms` (BD-50). The handler only brackets its calls with it;
 * it never reads a clock itself (NFR-06). `routing` brackets each `searchLeg` call, `estimates` brackets the timeline,
 * conditions, radiation and warnings assembly. Without a timer the calls run directly.
 */
export type PhaseTimer = <T>(phase: "routing" | "estimates", fn: () => T) => T;

/** Site data and measurement hooks a worker request needs beyond the grid (BD-50, BD-122). */
export interface HandlerOptions {
  /** The site's EnvConstant records (05 §E.3). Absent or without a matching rate: PLAN_RESULT has no `radiation`. */
  envConstants?: EnvConstant[];
  timer?: PhaseTimer;
}

const runDirect: PhaseTimer = (_phase, fn) => fn();

/**
 * Handle a worker request message against the currently loaded grid.
 * Pure function: takes the grid and the request, returns the response.
 * Optional maxExpansions parameter for testing TIMEOUT conditions.
 */
export function handleWorkerMessage(
  grid: LoadedGrid | null,
  request: WorkerRequest,
  maxExpansions?: number,
  options: HandlerOptions = {},
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
      return handleComputePlan(grid, request, maxExpansions, options);
    }

    const req = request as unknown as Record<string, unknown>;
    const reqId = typeof req?.request_id === "string" ? req.request_id : "unknown";
    const reqType = typeof req?.type === "string" ? req.type : "unknown";
    return {
      type: "ERROR",
      request_id: reqId,
      code: "INTERNAL",
      message: `Unknown worker request type: ${reqType}`,
    };
  } catch (err) {
    const req = request as unknown as Record<string, unknown>;
    const reqId = typeof req?.request_id === "string" ? req.request_id : "unknown";
    return {
      type: "ERROR",
      request_id: reqId,
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
  options: HandlerOptions = {},
): PurePlanResultMessage | WorkerError {
  const time = options.timer ?? runDirect;
  const waypoints = request.waypoints;
  const loop = request.scenario.loop;

  // In-flight cancellation (BD-41) is the async search of the worker-grid package; this handler is synchronous.
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
    const search = time("routing", () => searchLeg(grid, fromWp, toWp, request.scenario, maxExpansions));
    if (search.status === "TIMEOUT") {
      return {
        type: "ERROR",
        request_id: request.request_id,
        code: "TIMEOUT",
        message: `Routing search timed out between ${fromWp.id} and ${toWp.id}`,
      };
    }
    if (search.status === "CANCELLED") {
      return {
        type: "ERROR",
        request_id: request.request_id,
        code: "CANCELLED",
        message: `Routing search cancelled between ${fromWp.id} and ${toWp.id}`,
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
    const dwellMin = stopCount * request.scenario.dwell_min_per_stop;
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

  // 4. Timeline, conditions, radiation and warnings (BD-50). The site is the plan's start waypoint (the hab) through
  // the inverse working projection (projected metres in, planetocentric lat / east lon out). A PARTIAL plan has no
  // routed walk times, so it has no timeline and no dose duration; its EVA-sol conditions still need only the start.
  const { stops_timeline, conditions, radiation, warnings } = time("estimates", () => {
    const startWp = waypoints.find((w) => w.role === "start") ?? waypoints[0];
    const site = inverseEqc(startWp.x_m, startWp.y_m);
    const timeline = hasNoRoute
      ? []
      : evaTimeline(request.scenario, waypoints, legs.map((l) => (l.status === "OK" ? l.walk_time_min : Number.NaN)));
    const assembled = assembleConditions({
      site,
      timeline,
      scenario: request.scenario,
      envConstants: options.envConstants ?? [],
      durationH: totals === null ? null : totals.eva_total_min / 60,
    });
    // `undefined` timeline: the DARKNESS check over the timeline instants is BD-49 (warnings package).
    const collected = collectWarnings(legs, request.scenario, undefined, maxWbKm, grid, waypoints, cellPaths);
    return { ...assembled, warnings: collected };
  });
  const status = planStatus(legs, warnings);

  return {
    type: "PLAN_RESULT",
    request_id: request.request_id,
    plan_revision: request.plan_revision,
    status,
    legs,
    totals,
    stops_timeline,
    ...(conditions === undefined ? {} : { conditions }),
    ...(radiation === undefined ? {} : { radiation }),
    warnings,
  };
}
