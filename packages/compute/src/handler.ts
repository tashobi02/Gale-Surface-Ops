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
  WorkerResponse,
} from "@marswalk/protocol";
import { assembleConditions } from "./conditions";
import type { LoadedGrid } from "./grid";
import { toLeg } from "./leg";
import { searchLeg } from "./route";
import { DEFAULT_PROJECTION, samplePoint } from "./sampling";
import { evaTimeline } from "./timeModel";
import { validatePlanInput } from "./validate";
import { maxWalkbackKm } from "./walkback";
import { collectWarnings, countStops, planStatus } from "./warnings";

/**
 * Default environmental constants for Gale crater (05 §C; Hassler et al. 2014, Simonsen et al. 2024).
 * Used when no custom envConstants are supplied in the request.
 */
export const DEFAULT_ENV_CONSTANTS: EnvConstant[] = [
  {
    const_id: "rad-gale-dose-eq-solar-max",
    quantity: "surface dose equivalent rate",
    value: 0.64,
    low: 0.52,
    high: 0.76,
    unit: "mSv/day",
    conditions: { solar_phase: "max", location: "Gale crater floor", period: "2012-2013" },
    provenance: "measured",
    source_id: "hassler-2014-rad",
  },
  {
    const_id: "rad-gale-dose-eq-solar-min",
    quantity: "surface dose equivalent rate",
    value: 0.925,
    low: 0.85,
    high: 1.0,
    unit: "mSv/day",
    conditions: { solar_phase: "min", location: "Gale crater floor", period: "2019-2020" },
    provenance: "measured",
    source_id: "simonsen-2024-rad",
    note: "reported range, Simonsen et al. 2024",
  },
];

/**
 * Handle a worker request message against the currently loaded grid.
 * Pure function: takes the grid and the request, returns the response.
 * Optional maxExpansions parameter for testing TIMEOUT conditions.
 * Optional nowMs parameter for deterministic wall-clock timestamps in tests.
 */
export function handleWorkerMessage(
  grid: LoadedGrid | null,
  request: WorkerRequest,
  maxExpansions?: number,
  nowMs?: number,
  envConstants?: EnvConstant[],
  site?: { lat: number; lon_e: number },
): WorkerResponse {
  try {
    if (grid === null) {
      return {
        type: "ERROR",
        request_id: request.request_id,
        code: "GRID_NOT_LOADED",
        message: "Routing grid failed checksum or did not load.",
      };
    }

    if (request.type === "SAMPLE_POINT") {
      return handleSamplePoint(grid, request);
    }

    if (request.type === "COMPUTE_PLAN") {
      return handleComputePlan(grid, request, maxExpansions, nowMs, envConstants, site);
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
  nowMs?: number,
  envConstants?: EnvConstant[],
  site?: { lat: number; lon_e: number },
): PlanResultMessage | WorkerError {
  const currentWallTimeMs = nowMs ?? Date.now();
  const routingStartTime = currentWallTimeMs;

  // 1. Validation before search (02 §E.3)
  const validationErrors = validatePlanInput(
    request.scenario,
    request.waypoints,
    grid,
  );
  if (validationErrors.length > 0) {
    return {
      type: "ERROR",
      request_id: request.request_id,
      code: "INVALID_INPUT",
      message: validationErrors
        .map((e) => `${e.field}: ${e.message}`)
        .join("; "),
    };
  }

  const waypoints = request.waypoints;
  const loop = request.scenario.loop;

  // 2. Search legs between consecutive waypoints (+ return leg if loop)
  const legPairs: [typeof waypoints[0], typeof waypoints[0]][] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    legPairs.push([waypoints[i], waypoints[i + 1]]);
  }
  if (loop && waypoints.length >= 2) {
    legPairs.push([waypoints[waypoints.length - 1], waypoints[0]]);
  }

  const legs: PlanResult["legs"] = [];
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
  }

  const routingDurationMs = Math.max(1, (nowMs ?? Date.now()) - routingStartTime);
  const estimatesStartTime = nowMs ?? Date.now();

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

  // 4. Timeline, conditions, and radiation (Contract C8; T06.09 / T05.32)
  const legWalkMin = legs.map((l) => (l.status === "OK" ? l.walk_time_min : 0));
  const rawTimeline = evaTimeline(request.scenario, waypoints, legWalkMin);
  const durationH =
    totals !== null
      ? totals.eva_total_min / 60
      : request.scenario.max_eva_duration_h;

  const resolvedSite =
    site ??
    (request as unknown as { site?: { lat: number; lon_e: number } }).site ?? {
      lat: DEFAULT_PROJECTION.lat_0,
      lon_e: DEFAULT_PROJECTION.lon_0,
    };

  const resolvedEnvConstants =
    envConstants ??
    (request as unknown as { envConstants?: EnvConstant[] }).envConstants ??
    DEFAULT_ENV_CONSTANTS;

  const { stops_timeline, conditions, radiation } = assembleConditions({
    site: resolvedSite,
    timeline: rawTimeline,
    scenario: request.scenario,
    envConstants: resolvedEnvConstants,
    durationH,
  });

  // 5. Warnings and plan status
  const warnings = collectWarnings(
    legs,
    request.scenario,
    stops_timeline,
    maxWbKm,
    grid,
    waypoints,
  );
  const status = planStatus(legs, warnings);

  const estimatesDurationMs = Math.max(0, (nowMs ?? Date.now()) - estimatesStartTime);

  return {
    type: "PLAN_RESULT",
    request_id: request.request_id,
    plan_revision: request.plan_revision,
    status,
    legs,
    totals,
    stops_timeline,
    conditions,
    radiation,
    warnings,
    computed_utc: new Date(currentWallTimeMs).toISOString(),
    timing_ms: {
      routing: routingDurationMs,
      estimates: estimatesDurationMs,
    },
  };
}
