/**
 * Compute worker entry (docs/specs/02 §A.1, §E.2). Thin wrapper: all science comes from @marswalk/compute; no DOM, no fetch.
 * The pure handler is deterministic and reads no clock. This adapter owns everything that is not science:
 * - Grid delivery (BD-40): `LOAD_GRID` builds the grid with compute `loadGrid` and answers `GRID_LOADED` or `ERROR`;
 *   until then every request gets `GRID_NOT_LOADED`. The EnvConstant records ride along (BD-122).
 * - Cancellation (BD-41): the search yields to the event loop every `CANCEL_CHECK_EVERY_EXPANSIONS` expansions; a
 *   `COMPUTE_PLAN` with a higher `plan_revision` raises the flag the running search reads, so the running plan is answered
 *   `ERROR` `CANCELLED` in flight. A request older than the latest is answered `CANCELLED` without running.
 * - Run metadata of a PLAN_RESULT (BD-50): `computed_utc` (the genuine time of the run) and `timing_ms`: `total` is the
 *   measured handler duration (no minimum), `routing` the time inside the handler's search slices and `estimates` the
 *   time in its timeline, conditions, radiation and warnings assembly. The adapter owns the clock; the handler only
 *   brackets those calls with the timer it is given, so compute stays clock-free (NFR-06).
 * - SAMPLE_POINT's hard slope limit (BD-42): the request's own, else the scenario value of the last COMPUTE_PLAN, else the
 *   05 default read from schemas/plan-export.schema.json.
 * All state lives in the instance `createPlanWorker` returns; the module holds none. Input validation (02 §E.3)
 * happens in the pure handler -> INVALID_INPUT.
 */
import type { EnvConstant, GridLoaded, LoadGridRequest, PlanResultMessage, WorkerError, WorkerRequest, WorkerResponse } from "@marswalk/protocol";
import { handleWorkerMessageAsync, loadGrid, type LoadedGrid, type PhaseTimer } from "@marswalk/compute";
import planExportSchema from "../../../../schemas/plan-export.schema.json";

/** The 05 default of MissionScenario.hard_slope_limit_deg, read from the schema rather than typed here (BD-42). */
const SCHEMA_HARD_SLOPE_LIMIT_DEG: number = planExportSchema.$defs.MissionScenario.properties.hard_slope_limit_deg.default;

export interface PlanWorkerDeps {
  /** Lets other messages run between search slices; default: a zero-delay timeout. */
  yieldToLoop?: () => Promise<void>;
  /** Expansions between cancellation checks; default: compute's `CANCEL_CHECK_EVERY_EXPANSIONS`. */
  cancellationInterval?: number;
}

export interface PlanWorker {
  handleMessage(request: WorkerRequest): Promise<WorkerResponse>;
  /** Direct initialisation (tests, and any host that loads the grid itself). */
  setGrid(grid: LoadedGrid | null): void;
  /** The site's EnvConstant records, for the dose estimate (BD-122); `LOAD_GRID` also sets them. */
  setEnvConstants(envConstants: EnvConstant[]): void;
}

const timeoutYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function errorOf(request_id: string, code: WorkerError["code"], message: string): WorkerError {
  return { type: "ERROR", request_id, code, message };
}

export function createPlanWorker(deps: PlanWorkerDeps = {}): PlanWorker {
  const yieldToLoop = deps.yieldToLoop ?? timeoutYield;
  let currentGrid: LoadedGrid | null = null;
  let currentEnvConstants: EnvConstant[] = [];
  let latestRevision = -1;
  let hardSlopeLimitDeg = SCHEMA_HARD_SLOPE_LIMIT_DEG;

  function load(request: LoadGridRequest): GridLoaded | WorkerError {
    // A failed load leaves no grid: a stale grid of another site must never answer for this one.
    currentGrid = null;
    try {
      const a = request.arrays;
      currentGrid = loadGrid(request.meta, {
        elevation: a.elevation,
        slopeP90: a.slopeP90,
        slopeMax: a.slopeMax,
        flags: a.flags,
        commHab: a.commHab,
        ...(a.ti === null ? {} : { ti: a.ti }),
      });
    } catch (err) {
      return errorOf(request.request_id, "INVALID_INPUT", err instanceof Error ? err.message : String(err));
    }
    currentEnvConstants = request.env_constants ?? [];
    return { type: "GRID_LOADED", request_id: request.request_id, site_id: request.site_id, data_version: request.data_version };
  }

  async function handleMessage(request: WorkerRequest): Promise<WorkerResponse> {
    if (request.type === "LOAD_GRID") return load(request);

    let revision: number | undefined;
    if (request.type === "COMPUTE_PLAN") {
      if (request.plan_revision < latestRevision) {
        return errorOf(
          request.request_id,
          "CANCELLED",
          `Plan revision ${request.plan_revision} cancelled by newer revision ${latestRevision}`,
        );
      }
      latestRevision = request.plan_revision;
      revision = request.plan_revision;
      const limit = request.scenario?.hard_slope_limit_deg;
      if (typeof limit === "number" && Number.isFinite(limit)) hardSlopeLimitDeg = limit;
    }

    // Fresh per request: the phase timers are local to this call (no state carried between plans).
    const phaseMs = { routing: 0, estimates: 0 };
    const timer: PhaseTimer = (phase, fn) => {
      const phaseStart = performance.now();
      try {
        return fn();
      } finally {
        phaseMs[phase] += performance.now() - phaseStart;
      }
    };

    const startMs = performance.now();
    const response = await handleWorkerMessageAsync(currentGrid, request, {
      envConstants: currentEnvConstants,
      timer,
      hardSlopeLimitDeg,
      yieldToLoop,
      shouldCancel: revision === undefined ? undefined : () => latestRevision > revision,
      ...(deps.cancellationInterval === undefined ? {} : { cancellationInterval: deps.cancellationInterval }),
    });
    const elapsedMs = performance.now() - startMs;

    if (response.type === "PLAN_RESULT") {
      const planResultMsg = {
        ...response,
        computed_utc: new Date().toISOString(),
        timing_ms: { total: elapsedMs, routing: phaseMs.routing, estimates: phaseMs.estimates },
      } satisfies PlanResultMessage;
      return planResultMsg;
    }
    return response satisfies WorkerResponse;
  }

  return {
    handleMessage,
    setGrid(grid) {
      currentGrid = grid;
    },
    setEnvConstants(envConstants) {
      currentEnvConstants = envConstants;
    },
  };
}

// Wire worker onmessage only when running in a genuine Worker global scope (02 §A.1, #61). The instance exists only there.
const g = globalThis as unknown as {
  WorkerGlobalScope?: new () => unknown;
  self?: unknown;
  postMessage?: (message: unknown) => void;
  onmessage?: ((event: { data: WorkerRequest }) => void) | null;
};

const isWorkerScope =
  typeof g.WorkerGlobalScope === "function" &&
  typeof g.self !== "undefined" &&
  g.self instanceof g.WorkerGlobalScope;

if (isWorkerScope && typeof g.postMessage === "function") {
  const worker = createPlanWorker();
  g.onmessage = (event: { data: WorkerRequest }) => {
    // Not awaited by the event loop: a later message must be delivered while an earlier search is yielded (BD-41).
    void worker.handleMessage(event.data).then(
      (response) => g.postMessage!(response),
      (err: unknown) =>
        g.postMessage!({
          type: "ERROR",
          request_id: event.data?.request_id ?? "unknown",
          code: "INTERNAL",
          message: err instanceof Error ? err.message : String(err),
        }),
    );
  };
}
