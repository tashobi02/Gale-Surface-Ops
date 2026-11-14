/**
 * Pure request handler for the compute worker (docs/specs/02 §E.2).
 * FR-03, FR-06, FR-07, NFR-06. Implemented by TASK-05 (T05.26, T05.32).
 * Dispatches SAMPLE_POINT and COMPUTE_PLAN requests against a LoadedGrid.
 */
import type {
  ComputePlanRequest,
  EnvConstant,
  ManualLegInput,
  ManualLegResult,
  PlanResult,
  PlanResultMessage,
  SamplePointRequest,
  SampleResult,
  ValidateManualLegRequest,
  WorkerError,
  WorkerRequest,
} from "@marswalk/protocol";
import { assembleConditions } from "./conditions";
import type { LoadedGrid } from "./grid";
import { toLeg } from "./leg";
import { validateManualLeg } from "./manualLeg";
import { cellsAlongPath } from "./paths";
import { CANCEL_CHECK_EVERY_EXPANSIONS, MAX_NODE_EXPANSIONS, searchLeg, searchLegSteps, type LegSearch } from "./route";
import { inverseEqc, parseEqcProjection, samplePoint } from "./sampling";
import { evaTimeline } from "./timeModel";
import { validatePlanInput, validateWorkerRequest } from "./validate";
import { maxWalkbackKm } from "./walkback";
import { collectWarnings, countStops, planStatus } from "./warnings";

export type PurePlanResultMessage = Omit<PlanResultMessage, "computed_utc" | "timing_ms">;
export type PureWorkerResponse = SampleResult | PurePlanResultMessage | ManualLegResult | WorkerError;

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
  /**
   * SAMPLE_POINT's limit when the request carries none: the worker passes the scenario value it last received (BD-42).
   * Neither present: INVALID_INPUT; compute holds no default.
   */
  hardSlopeLimitDeg?: number;
  /** Cancel flag read at each cancellation check (BD-41). */
  shouldCancel?: () => boolean;
  /** Expansions between checks; default `CANCEL_CHECK_EVERY_EXPANSIONS`. */
  cancellationInterval?: number;
}

/** The async handler additionally needs the adapter's yield (compute reads no clock and sets no timers). */
export interface AsyncHandlerOptions extends HandlerOptions {
  yieldToLoop: () => Promise<void>;
  /** Test hook for TIMEOUT, as the third argument of the synchronous handler. */
  maxExpansions?: number;
}

const runDirect: PhaseTimer = (_phase, fn) => fn();

function errorOf(request: unknown, code: WorkerError["code"], message: string): WorkerError {
  const req = request as Record<string, unknown> | null;
  return { type: "ERROR", request_id: typeof req?.request_id === "string" ? req.request_id : "unknown", code, message };
}

/** Envelope, grid and input checks shared by both handlers; an error response, or null when the request may run. */
function preflight(grid: LoadedGrid | null, request: WorkerRequest): WorkerError | null {
  if (request === null || typeof request !== "object" || Array.isArray(request) || typeof request.type !== "string") {
    return errorOf(request, "INVALID_INPUT", "Worker request must be an object with a type");
  }
  if (grid === null) {
    return errorOf(request, "GRID_NOT_LOADED", "Routing grid failed checksum or did not load.");
  }
  if (request.type === "SAMPLE_POINT" || request.type === "COMPUTE_PLAN") {
    const errors = validateWorkerRequest(request, grid);
    if (errors.length > 0) {
      return errorOf(request, "INVALID_INPUT", errors.map((error) => `${error.field}: ${error.message}`).join("; "));
    }
  }
  if (request.type === "VALIDATE_MANUAL_LEG") {
    const errors = manualLegErrors(request);
    if (errors.length > 0) return errorOf(request, "INVALID_INPUT", errors.join("; "));
  }
  return null;
}

/** The request-level checks of VALIDATE_MANUAL_LEG (01-contract §7); the scenario goes through the shared 02 §E.3 rules. */
function manualLegErrors(request: ValidateManualLegRequest): string[] {
  const errors: string[] = [];
  const nonempty = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
  if (typeof request.request_id !== "string" || request.request_id.trim().length === 0) errors.push("request_id: must be a nonempty string");
  if (!Number.isSafeInteger(request.plan_revision)) errors.push("plan_revision: must be a safe integer");
  if (!nonempty(request.from)) errors.push("from: must be a nonempty waypoint id");
  if (!nonempty(request.to)) errors.push("to: must be a nonempty waypoint id");
  const vertices: unknown = request.vertices;
  if (!Array.isArray(vertices) || vertices.length < 2) {
    errors.push("vertices: must be an array of at least two [x_m, y_m] points");
  } else if (!vertices.every((v) => Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]))) {
    errors.push("vertices: every vertex must be a finite [x_m, y_m] pair");
  }
  const scenario: unknown = request.scenario;
  if (typeof scenario !== "object" || scenario === null || Array.isArray(scenario)) {
    errors.push("scenario: must be an object");
  } else {
    const fields = scenario as Record<string, unknown>;
    for (const field of ["hard_slope_limit_deg", "caution_slope_deg", "suited_flat_speed_kmh"]) {
      if (typeof fields[field] !== "number" || !Number.isFinite(fields[field])) errors.push(`${field}: is required and must be finite`);
    }
    errors.push(...validatePlanInput(request.scenario).map((error) => `${error.field}: ${error.message}`));
  }
  return errors;
}

/** Answer VALIDATE_MANUAL_LEG: the hand-drawn leg measured on the grid, with its warnings (T05.30). */
function handleManualLeg(grid: LoadedGrid, request: ValidateManualLegRequest): ManualLegResult {
  const { leg, warnings } = validateManualLeg(grid, request.scenario, request.from, request.to, request.vertices);
  return { type: "MANUAL_LEG_RESULT", request_id: request.request_id, plan_revision: request.plan_revision, leg, warnings };
}

/**
 * Handle a worker request message against the currently loaded grid.
 * Pure function: takes the grid and the request, returns the response. Synchronous, so a cancel flag is read only at
 * the check interval; in-flight cancellation is {@link handleWorkerMessageAsync}.
 * Optional maxExpansions parameter for testing TIMEOUT conditions.
 */
export function handleWorkerMessage(
  grid: LoadedGrid | null,
  request: WorkerRequest,
  maxExpansions?: number,
  options: HandlerOptions = {},
): PureWorkerResponse {
  try {
    const refused = preflight(grid, request);
    if (refused) return refused;
    const loaded = grid as LoadedGrid;
    if (request.type === "SAMPLE_POINT") return handleSamplePoint(loaded, request, options);
    if (request.type === "COMPUTE_PLAN") return handleComputePlan(loaded, request, maxExpansions, options);
    if (request.type === "VALIDATE_MANUAL_LEG") return handleManualLeg(loaded, request);
    return errorOf(request, "INTERNAL", `Unknown worker request type: ${String((request as { type: unknown }).type)}`);
  } catch (err) {
    return errorOf(request, "INTERNAL", err instanceof Error ? err.message : String(err));
  }
}

/**
 * The same handler with in-flight cancellation (BD-41): each leg's search yields to the event loop every
 * `cancellationInterval` expansions and reads `shouldCancel` afterwards. The result equals the synchronous handler's.
 * The phase timer brackets only the synchronous slices, never an await.
 */
export async function handleWorkerMessageAsync(
  grid: LoadedGrid | null,
  request: WorkerRequest,
  options: AsyncHandlerOptions,
): Promise<PureWorkerResponse> {
  try {
    const refused = preflight(grid, request);
    if (refused) return refused;
    if (request.type !== "COMPUTE_PLAN") return handleWorkerMessage(grid, request, undefined, options);
    const loaded = grid as LoadedGrid;
    const time = options.timer ?? runDirect;
    const maxExpansions = options.maxExpansions ?? MAX_NODE_EXPANSIONS;
    const interval = options.cancellationInterval ?? CANCEL_CHECK_EVERY_EXPANSIONS;
    const pairs = legPairsOf(request);
    const manual = manualLegsOf(request);
    const searches: LegSearch[] = [];
    for (const [fromWp, toWp] of pairs) {
      // A manual leg replaces its pair's routed leg (N-160(c)): the pair is not searched at all, so the measured polyline
      // is what the plan carries. The other pairs are routed as usual.
      if (manual.has(pairKey(fromWp.id, toWp.id))) {
        searches.push({ status: "MANUAL" } as LegSearch);
        continue;
      }
      const steps = searchLegSteps(loaded, fromWp, toWp, request.scenario, maxExpansions, interval);
      let search: LegSearch | undefined;
      while (search === undefined) {
        const step = time("routing", () => steps.next());
        if (step.done) {
          search = step.value;
        } else {
          await options.yieldToLoop();
          if (options.shouldCancel?.()) search = { status: "CANCELLED" };
        }
      }
      const ended = searchEnd(search, request, fromWp, toWp);
      if (ended) return ended;
      searches.push(search);
    }
    return finishPlan(loaded, request, pairs, searches, options, manual);
  } catch (err) {
    return errorOf(request, "INTERNAL", err instanceof Error ? err.message : String(err));
  }
}

function handleSamplePoint(
  grid: LoadedGrid,
  request: SamplePointRequest,
  options: HandlerOptions,
): SampleResult | WorkerError {
  const limit = request.hard_slope_limit_deg ?? options.hardSlopeLimitDeg;
  if (limit === undefined) {
    return errorOf(request, "INVALID_INPUT", "hard_slope_limit_deg: the request has none and the worker holds no scenario yet");
  }
  const result = samplePoint(grid, request.x_m, request.y_m, request.snap_radius_m, limit);

  return {
    type: "SAMPLE_RESULT",
    request_id: request.request_id,
    ...result,
  };
}

type Waypoints = ComputePlanRequest["waypoints"];

/** Consecutive waypoint pairs, plus the return leg to the first waypoint for a loop. */
function legPairsOf(request: ComputePlanRequest): [Waypoints[number], Waypoints[number]][] {
  const waypoints = request.waypoints;
  const pairs: [Waypoints[number], Waypoints[number]][] = [];
  for (let i = 0; i < waypoints.length - 1; i++) pairs.push([waypoints[i], waypoints[i + 1]]);
  if (request.scenario.loop && waypoints.length >= 2) pairs.push([waypoints[waypoints.length - 1], waypoints[0]]);
  return pairs;
}

/** The error response for a search that did not end in OK or NO_ROUTE; null otherwise. */
function searchEnd(search: LegSearch, request: ComputePlanRequest, fromWp: Waypoints[number], toWp: Waypoints[number]): WorkerError | null {
  if (search.status === "TIMEOUT") {
    return errorOf(request, "TIMEOUT", `Routing search timed out between ${fromWp.id} and ${toWp.id}`);
  }
  if (search.status === "CANCELLED") {
    return errorOf(request, "CANCELLED", `Routing search cancelled between ${fromWp.id} and ${toWp.id}`);
  }
  return null;
}

/** The key a leg pair is addressed by in the request's `manual_legs`: its two waypoint ids, in order. */
function pairKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

/**
 * The manual legs of a COMPUTE_PLAN, by pair key (N-160(c)). A leg for a pair the plan does not have is ignored: the plan
 * reads the legs by the pairs it has, so a stale polyline cannot enter it. One leg per pair: the first one wins.
 */
function manualLegsOf(request: ComputePlanRequest): Map<string, ManualLegInput> {
  const map = new Map<string, ManualLegInput>();
  const legs = request.manual_legs;
  if (!Array.isArray(legs)) return map;
  for (const leg of legs) {
    if (!leg || typeof leg !== "object") continue;
    const from = leg.from;
    const to = leg.to;
    if (typeof from !== "string" || typeof to !== "string") continue;
    const key = pairKey(from, to);
    if (map.has(key)) continue;
    const vertices = leg.vertices;
    if (!Array.isArray(vertices) || vertices.length < 2) continue;
    if (!vertices.every((v) => Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]))) continue;
    map.set(key, { from, to, vertices: vertices.map((v) => [v[0], v[1]] as [number, number]) });
  }
  return map;
}

/** The cells a manual polyline crosses, for the walkback and the leg warnings (N-160(c)). */
function cellsOf(grid: LoadedGrid, vertices: readonly (readonly [number, number])[]): readonly number[] {
  return cellsAlongPath(grid, vertices);
}

function handleComputePlan(
  grid: LoadedGrid,
  request: ComputePlanRequest,
  maxExpansions?: number,
  options: HandlerOptions = {},
): PurePlanResultMessage | WorkerError {
  const time = options.timer ?? runDirect;
  const pairs = legPairsOf(request);
  const manual = manualLegsOf(request);
  const searches: LegSearch[] = [];
  for (const [fromWp, toWp] of pairs) {
    // A manual leg replaces its pair's routed leg (N-160(c)): the pair is not searched at all, so the measured polyline
    // is what the plan carries. The other pairs are routed as usual.
    if (manual.has(pairKey(fromWp.id, toWp.id))) {
      searches.push({ status: "MANUAL" } as LegSearch);
      continue;
    }
    const search = time("routing", () =>
      searchLeg(grid, fromWp, toWp, request.scenario, maxExpansions, options.shouldCancel, options.cancellationInterval),
    );
    const ended = searchEnd(search, request, fromWp, toWp);
    if (ended) return ended;
    searches.push(search);
  }
  return finishPlan(grid, request, pairs, searches, options, manual);
}

/** Legs, totals, timeline, conditions, radiation and warnings from finished searches (shared by both handlers). */
function finishPlan(
  grid: LoadedGrid,
  request: ComputePlanRequest,
  pairs: [Waypoints[number], Waypoints[number]][],
  searches: LegSearch[],
  options: HandlerOptions,
  manual: Map<string, ManualLegInput> = new Map(),
): PurePlanResultMessage {
  const time = options.timer ?? runDirect;
  const waypoints = request.waypoints;
  const loop = request.scenario.loop;
  const legs: PlanResult["legs"] = [];
  const cellPaths: (readonly number[] | undefined)[] = [];
  pairs.forEach(([fromWp, toWp], i) => {
    const search = searches[i];
    const manualLeg = manual.get(pairKey(fromWp.id, toWp.id));
    if (manualLeg) {
      // The manual leg is measured on the grid here too (N-160(c)): the page sends the polyline, the worker measures it.
      // The page never sends a leg, so nothing can enter the plan unmeasured.
      const measured = validateManualLeg(grid, request.scenario, fromWp.id, toWp.id, manualLeg.vertices);
      legs.push(measured.leg);
      cellPaths.push(measured.leg.status === "OK" ? cellsOf(grid, manualLeg.vertices) : undefined);
      return;
    }
    legs.push(toLeg(grid, fromWp.id, toWp.id, search, request.scenario));
    cellPaths.push(search.status === "OK" ? search.cells : undefined);
  });

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
    const site = inverseEqc(startWp.x_m, startWp.y_m, parseEqcProjection(grid.meta.proj4));
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
    // DARKNESS reads the timeline instants and the site (BD-49); a PARTIAL plan has an empty timeline, so none is raised.
    const collected = collectWarnings(legs, request.scenario, assembled.stops_timeline, maxWbKm, grid, waypoints, cellPaths, site);
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
