/**
 * Worker adapter metadata (docs/specs/02 §E.2, 05 PlanResult; NFR-06; TASK-05 T05.15, T05.27, T05.32).
 * The pure handler in @marswalk/compute no longer reads the clock; the adapter in
 * apps/web/src/worker/planWorker.ts adds `computed_utc` and a measured `timing_ms.total`.
 * The handler is replaced here by a stub, so these tests do not depend on routing science.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ComputePlanRequest, EnvConstant, LoadGridRequest, PlanResultMessage, SamplePointRequest, WorkerError } from "@marswalk/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makePlaneGrid } from "../fixtures/grids";

const handleWorkerMessageAsync = vi.hoisted(() => vi.fn());

vi.mock("@marswalk/compute", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@marswalk/compute")>()),
  handleWorkerMessageAsync,
}));

const planRequest: ComputePlanRequest = {
  type: "COMPUTE_PLAN",
  request_id: "req-plan",
  plan_revision: 3,
  site_id: "mock_site",
  data_version: "mock_site-2026.11.05",
  scenario: {
    eva_start_utc: "2026-11-14T08:00:00Z",
    max_eva_duration_h: 6,
    dwell_min_per_stop: 20,
    hard_slope_limit_deg: 15,
    caution_slope_deg: 10,
    walkback_limit_km: 5,
    suited_flat_speed_kmh: 3.3,
    solar_phase: "max",
    loop: false,
    max_haven_min: 30,
    crew_count: 2,
    vehicle_available: true,
    vehicle_param_set: "pr1-assumed",
  },
  waypoints: [
    { id: "wp-0", role: "start", x_m: 0, y_m: 0 },
    { id: "wp-1", role: "stop", x_m: 25, y_m: 0 },
  ],
};

const pureOk: Omit<PlanResultMessage, "computed_utc" | "timing_ms"> = {
  type: "PLAN_RESULT",
  request_id: "req-plan",
  plan_revision: 3,
  status: "OK",
  legs: [],
  totals: null,
  stops_timeline: [],
  warnings: [],
};

const FIXED_NOW = "2026-11-09T10:11:12.345Z";

/** A fresh adapter instance per test: its state lives in the instance, not in the module (BD-40). */
async function loadAdapter(deps: Parameters<typeof import("../../src/worker/planWorker").createPlanWorker>[0] = {}) {
  vi.resetModules();
  const { createPlanWorker } = await import("../../src/worker/planWorker");
  const worker = createPlanWorker(deps);
  return { handleMessage: worker.handleMessage, setWorkerGrid: worker.setGrid, setWorkerEnvConstants: worker.setEnvConstants };
}

/**
 * Controlled clock: performance.now() returns a value that only moves when the stubbed handler
 * "runs for" `elapsedMs` (other readers of performance.now, such as the test runner, see the same value).
 */
function stubHandlerThatTakes(elapsedMs: number, result: unknown) {
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  handleWorkerMessageAsync.mockImplementation(() => {
    now += elapsedMs;
    return result;
  });
}

describe("planWorker adapter metadata", () => {
  beforeEach(() => {
    handleWorkerMessageAsync.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(FIXED_NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("adds the run timestamp and measured total duration to PLAN_RESULT", async () => {
    stubHandlerThatTakes(12.5, pureOk);
    const { handleMessage } = await loadAdapter();

    const response = await handleMessage(planRequest) as PlanResultMessage;

    expect(response.type).toBe("PLAN_RESULT");
    expect(response.computed_utc).toBe(FIXED_NOW);
    expect(response.timing_ms).toEqual({ total: 12.5, routing: 0, estimates: 0 });
  });

  it("keeps a measured zero duration at zero (no minimum)", async () => {
    stubHandlerThatTakes(0, pureOk);
    const { handleMessage } = await loadAdapter();

    const response = await handleMessage(planRequest) as PlanResultMessage;

    expect(response.timing_ms.total).toBe(0);
  });

  it("reports routing and estimates as the time the handler spends inside the timer it was given (BD-50)", async () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    handleWorkerMessageAsync.mockImplementation(
      (_grid: unknown, _request: unknown, options: { timer: <T>(phase: "routing" | "estimates", fn: () => T) => T }) => {
        options.timer("routing", () => { now += 4; });
        options.timer("routing", () => { now += 3; });
        now += 1; // time outside both phases counts only in total
        options.timer("estimates", () => { now += 2; });
        return pureOk;
      },
    );
    const { handleMessage } = await loadAdapter();

    const response = await handleMessage(planRequest) as PlanResultMessage;

    expect(response.timing_ms).toEqual({ total: 10, routing: 7, estimates: 2 });
  });

  it("starts the phase timers at zero for every plan (no state carried between requests)", async () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    handleWorkerMessageAsync.mockImplementation(
      (_grid: unknown, _request: unknown, options: { timer: <T>(phase: "routing" | "estimates", fn: () => T) => T }) => {
        options.timer("routing", () => { now += 5; });
        return pureOk;
      },
    );
    const { handleMessage } = await loadAdapter();

    await handleMessage(planRequest);
    const second = await handleMessage({ ...planRequest, plan_revision: 4 }) as PlanResultMessage;

    expect(second.timing_ms.routing).toBe(5);
  });

  it("keeps the pure plan fields and the empty M3 timeline untouched", async () => {
    stubHandlerThatTakes(1, pureOk);
    const { handleMessage } = await loadAdapter();

    const response = await handleMessage(planRequest) as PlanResultMessage;

    expect(response).toMatchObject({
      type: "PLAN_RESULT",
      request_id: "req-plan",
      plan_revision: 3,
      status: "OK",
      legs: [],
      totals: null,
      stops_timeline: [],
      warnings: [],
    });
    expect(response).not.toHaveProperty("conditions");
    expect(response).not.toHaveProperty("radiation");
  });

  it("passes the grid-bound request through to the pure handler", async () => {
    stubHandlerThatTakes(1, pureOk);
    const { handleMessage, setWorkerGrid } = await loadAdapter();
    setWorkerGrid(null);

    await handleMessage(planRequest);

    expect(handleWorkerMessageAsync).toHaveBeenCalledTimes(1);
    expect(handleWorkerMessageAsync).toHaveBeenCalledWith(null, planRequest, expect.objectContaining({ timer: expect.any(Function) }));
  });

  it("hands the env constants set for the site to the pure handler (radiation inputs, BD-122)", async () => {
    stubHandlerThatTakes(1, pureOk);
    const { handleMessage, setWorkerEnvConstants } = await loadAdapter();
    const rate = { const_id: "rad-test", unit: "mSv/day", conditions: { solar_phase: "max" } } as unknown as EnvConstant;
    setWorkerEnvConstants([rate]);

    await handleMessage(planRequest);

    expect(handleWorkerMessageAsync.mock.calls[0][2]).toMatchObject({ envConstants: [rate] });
  });

  it("returns SAMPLE_RESULT unchanged, without plan metadata", async () => {
    const sample = {
      type: "SAMPLE_RESULT",
      request_id: "req-sample",
      inside_aoi: true,
      passable: true,
      reason: null,
      lat: null,
      lon_e: null,
      elevation_m: 0,
      slope_p90_deg: 0,
      ti_tiu: null,
      flags: [],
      snap: null,
    };
    handleWorkerMessageAsync.mockReturnValue(sample);
    const { handleMessage } = await loadAdapter();
    const request: SamplePointRequest = { type: "SAMPLE_POINT", request_id: "req-sample", x_m: 1, y_m: -1, snap_radius_m: 50 };

    const response = await handleMessage(request);

    expect(response).toEqual(sample);
    expect(response).not.toHaveProperty("computed_utc");
    expect(response).not.toHaveProperty("timing_ms");
  });

  it("returns handler errors unchanged, without plan metadata", async () => {
    const error: WorkerError = {
      type: "ERROR",
      request_id: "req-plan",
      code: "GRID_NOT_LOADED",
      message: "Grid not loaded",
    };
    handleWorkerMessageAsync.mockReturnValue(error);
    const { handleMessage } = await loadAdapter();

    const response = await handleMessage(planRequest);

    expect(response).toEqual(error);
    expect(response).not.toHaveProperty("computed_utc");
    expect(response).not.toHaveProperty("timing_ms");
  });

  it("rejects a stale plan_revision before calling the handler (stale-request rejection; in-flight cancellation is tested below)", async () => {
    stubHandlerThatTakes(1, pureOk);
    const { handleMessage } = await loadAdapter();

    await handleMessage({ ...planRequest, request_id: "req-new", plan_revision: 10 });
    handleWorkerMessageAsync.mockClear();
    const stale = await handleMessage({ ...planRequest, request_id: "req-old", plan_revision: 5 });

    expect(stale).toMatchObject({ type: "ERROR", request_id: "req-old", code: "CANCELLED" });
    expect(handleWorkerMessageAsync).not.toHaveBeenCalled();
  });

  it("passes the scenario limit of the last plan to SAMPLE_POINT requests that carry none (BD-42)", async () => {
    stubHandlerThatTakes(1, pureOk);
    const { handleMessage } = await loadAdapter();
    await handleMessage({ ...planRequest, scenario: { ...planRequest.scenario, hard_slope_limit_deg: 22 } });
    handleWorkerMessageAsync.mockClear();

    await handleMessage({ type: "SAMPLE_POINT", request_id: "s", x_m: 1, y_m: -1, snap_radius_m: 50 });

    expect(handleWorkerMessageAsync.mock.calls[0][2]).toMatchObject({ hardSlopeLimitDeg: 22 });
  });

  it("before any plan, SAMPLE_POINT gets the 05 default read from the schema, not a literal in the adapter (BD-42)", async () => {
    stubHandlerThatTakes(1, pureOk);
    const { handleMessage } = await loadAdapter();
    const schema = JSON.parse(readFileSync(fileURLToPath(new URL("../../../../schemas/plan-export.schema.json", import.meta.url)), "utf8"));
    const schemaDefault = schema.$defs.MissionScenario.properties.hard_slope_limit_deg.default;

    await handleMessage({ type: "SAMPLE_POINT", request_id: "s", x_m: 1, y_m: -1, snap_radius_m: 50 });

    expect(handleWorkerMessageAsync.mock.calls[0][2]).toMatchObject({ hardSlopeLimitDeg: schemaDefault });
  });
});

// BD-40: LOAD_GRID delivers the grid; until then every request is GRID_NOT_LOADED.
describe("planWorker LOAD_GRID (BD-40)", () => {
  const loadRequest = (overrides: Partial<LoadGridRequest> = {}): LoadGridRequest => {
    const g = makePlaneGrid({ width: 4, height: 4, cell_m: 5, slope_deg: 0, origin_m: [0, 0], includeTi: false });
    const copy = (a: ArrayBufferView) => a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer;
    return {
      type: "LOAD_GRID",
      request_id: "load-1",
      site_id: "mock_site",
      data_version: "mock_site-2026.11.05",
      meta: g.meta,
      arrays: { elevation: copy(g.elevation), slopeP90: copy(g.slopeP90), slopeMax: copy(g.slopeMax), flags: copy(g.flags), ti: null, commHab: copy(g.commHab) },
      ...overrides,
    };
  };

  beforeEach(() => {
    handleWorkerMessageAsync.mockReset();
    handleWorkerMessageAsync.mockImplementation(async (grid: unknown, request: { request_id: string }) =>
      grid === null ? { type: "ERROR", request_id: request.request_id, code: "GRID_NOT_LOADED", message: "no grid" } : pureOk);
  });

  it("answers GRID_LOADED with the ids, then hands the loaded grid to the handler", async () => {
    const { handleMessage } = await loadAdapter();
    expect(await handleMessage(planRequest)).toMatchObject({ code: "GRID_NOT_LOADED" });

    const loaded = await handleMessage(loadRequest());
    expect(loaded).toEqual({ type: "GRID_LOADED", request_id: "load-1", site_id: "mock_site", data_version: "mock_site-2026.11.05" });

    await handleMessage(planRequest);
    const grid = handleWorkerMessageAsync.mock.calls.at(-1)![0] as { meta: { width: number; proj4: string }; elevation: Float32Array };
    expect(grid.meta.width).toBe(4);
    expect(grid.meta.proj4).toContain("+proj=eqc");
    expect(grid.elevation).toHaveLength(16);
  });

  it("hands the delivered env_constants to later plans (BD-122)", async () => {
    const { handleMessage } = await loadAdapter();
    const rate = { const_id: "rad-test", unit: "mSv/day", conditions: { solar_phase: "max" } } as unknown as EnvConstant;
    await handleMessage(loadRequest({ env_constants: [rate] }));
    await handleMessage(planRequest);
    expect(handleWorkerMessageAsync.mock.calls.at(-1)![2]).toMatchObject({ envConstants: [rate] });
  });

  it("answers ERROR INVALID_INPUT for arrays that do not match the meta, and leaves no grid loaded", async () => {
    const { handleMessage } = await loadAdapter();
    await handleMessage(loadRequest());
    const bad = loadRequest({ request_id: "load-bad" });
    bad.arrays.elevation = new ArrayBuffer(8);

    expect(await handleMessage(bad)).toMatchObject({ type: "ERROR", request_id: "load-bad", code: "INVALID_INPUT" });
    expect(await handleMessage(planRequest)).toMatchObject({ code: "GRID_NOT_LOADED" });
  });

  it("answers ERROR INVALID_INPUT for a meta whose proj4 is not Mars eqc", async () => {
    const { handleMessage } = await loadAdapter();
    const bad = loadRequest({ request_id: "load-proj" });
    bad.meta = { ...bad.meta, proj4: "+proj=merc +R=6378137 +units=m +no_defs" };
    expect(await handleMessage(bad)).toMatchObject({ type: "ERROR", request_id: "load-proj", code: "INVALID_INPUT" });
  });

  it("accepts a TI buffer when one is delivered", async () => {
    const { handleMessage } = await loadAdapter();
    const req = loadRequest();
    req.arrays.ti = new Float32Array(16).buffer;
    expect(await handleMessage(req)).toMatchObject({ type: "GRID_LOADED" });
  });
});

// BD-41: a newer COMPUTE_PLAN cancels the one being searched, in flight.
describe("planWorker in-flight cancellation (BD-41)", () => {
  it("answers the running plan CANCELLED once a higher revision arrives while it is yielded, and still serves the new one", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    handleWorkerMessageAsync.mockReset();
    handleWorkerMessageAsync.mockImplementation(async (_g: unknown, request: ComputePlanRequest, options: { shouldCancel: () => boolean; yieldToLoop: () => Promise<void> }) => {
      if (request.plan_revision === 1) {
        await gate; // the search is yielded here
        await options.yieldToLoop();
        return options.shouldCancel()
          ? { type: "ERROR", request_id: request.request_id, code: "CANCELLED", message: "cancelled" }
          : { ...pureOk, request_id: request.request_id, plan_revision: 1 };
      }
      return { ...pureOk, request_id: request.request_id, plan_revision: request.plan_revision };
    });
    const { handleMessage, setWorkerGrid } = await loadAdapter({ yieldToLoop: async () => {} });
    setWorkerGrid({} as never);

    const first = handleMessage({ ...planRequest, request_id: "r1", plan_revision: 1 });
    const second = handleMessage({ ...planRequest, request_id: "r2", plan_revision: 2 });
    release();

    expect(await first).toMatchObject({ type: "ERROR", request_id: "r1", code: "CANCELLED" });
    expect(await second).toMatchObject({ type: "PLAN_RESULT", request_id: "r2", plan_revision: 2 });
  });

  it("does not cancel a plan because a SAMPLE_POINT or an equal revision arrived", async () => {
    handleWorkerMessageAsync.mockReset();
    let cancelFlag: (() => boolean) | undefined;
    handleWorkerMessageAsync.mockImplementation(async (_g: unknown, request: { type: string; request_id: string }, options: { shouldCancel: () => boolean }) => {
      if (request.type === "COMPUTE_PLAN") cancelFlag = options.shouldCancel;
      return pureOk;
    });
    const { handleMessage } = await loadAdapter();
    await handleMessage(planRequest);
    await handleMessage({ type: "SAMPLE_POINT", request_id: "s", x_m: 1, y_m: -1, snap_radius_m: 50 });
    expect(cancelFlag?.()).toBe(false);
    await handleMessage({ ...planRequest, request_id: "same", plan_revision: planRequest.plan_revision });
    expect(cancelFlag?.()).toBe(false);
  });

  it("keeps the state of one adapter out of another (no module-level state)", async () => {
    handleWorkerMessageAsync.mockReset();
    handleWorkerMessageAsync.mockResolvedValue(pureOk);
    vi.resetModules();
    const { createPlanWorker } = await import("../../src/worker/planWorker");
    const a = createPlanWorker();
    const b = createPlanWorker();
    await a.handleMessage({ ...planRequest, plan_revision: 50 });
    const fromB = await b.handleMessage({ ...planRequest, plan_revision: 1 });
    expect(fromB).toMatchObject({ type: "PLAN_RESULT" });
  });
});
