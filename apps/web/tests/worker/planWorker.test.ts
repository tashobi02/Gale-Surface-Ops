/**
 * Worker adapter metadata (docs/specs/02 §E.2, 05 PlanResult; NFR-06; TASK-05 T05.15, T05.27, T05.32).
 * The pure handler in @marswalk/compute no longer reads the clock; the adapter in
 * apps/web/src/worker/planWorker.ts adds `computed_utc` and a measured `timing_ms.total`.
 * The handler is replaced here by a stub, so these tests do not depend on routing science.
 */
import type { ComputePlanRequest, PlanResultMessage, SamplePointRequest, WorkerError } from "@marswalk/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handleWorkerMessage = vi.hoisted(() => vi.fn());

vi.mock("@marswalk/compute", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@marswalk/compute")>()),
  handleWorkerMessage,
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

async function loadAdapter() {
  vi.resetModules();
  return import("../../src/worker/planWorker");
}

/**
 * Controlled clock: performance.now() returns a value that only moves when the stubbed handler
 * "runs for" `elapsedMs` (other readers of performance.now, such as the test runner, see the same value).
 */
function stubHandlerThatTakes(elapsedMs: number, result: unknown) {
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  handleWorkerMessage.mockImplementation(() => {
    now += elapsedMs;
    return result;
  });
}

describe("planWorker adapter metadata", () => {
  beforeEach(() => {
    handleWorkerMessage.mockReset();
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

    const response = handleMessage(planRequest) as PlanResultMessage;

    expect(response.type).toBe("PLAN_RESULT");
    expect(response.computed_utc).toBe(FIXED_NOW);
    expect(response.timing_ms).toEqual({ total: 12.5 });
  });

  it("keeps a measured zero duration at zero (no minimum)", async () => {
    stubHandlerThatTakes(0, pureOk);
    const { handleMessage } = await loadAdapter();

    const response = handleMessage(planRequest) as PlanResultMessage;

    expect(response.timing_ms.total).toBe(0);
  });

  it("reports only the total: no fabricated routing or estimates timings", async () => {
    stubHandlerThatTakes(7, pureOk);
    const { handleMessage } = await loadAdapter();

    const response = handleMessage(planRequest) as PlanResultMessage;

    expect(Object.keys(response.timing_ms)).toEqual(["total"]);
    expect(response.timing_ms).not.toHaveProperty("routing");
    expect(response.timing_ms).not.toHaveProperty("estimates");
  });

  it("keeps the pure plan fields and the empty M3 timeline untouched", async () => {
    stubHandlerThatTakes(1, pureOk);
    const { handleMessage } = await loadAdapter();

    const response = handleMessage(planRequest) as PlanResultMessage;

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

    handleMessage(planRequest);

    expect(handleWorkerMessage).toHaveBeenCalledTimes(1);
    expect(handleWorkerMessage).toHaveBeenCalledWith(null, planRequest);
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
    handleWorkerMessage.mockReturnValue(sample);
    const { handleMessage } = await loadAdapter();
    const request: SamplePointRequest = { type: "SAMPLE_POINT", request_id: "req-sample", x_m: 1, y_m: -1, snap_radius_m: 50 };

    const response = handleMessage(request);

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
    handleWorkerMessage.mockReturnValue(error);
    const { handleMessage } = await loadAdapter();

    const response = handleMessage(planRequest);

    expect(response).toEqual(error);
    expect(response).not.toHaveProperty("computed_utc");
    expect(response).not.toHaveProperty("timing_ms");
  });

  it("rejects a stale plan_revision before calling the handler (stale-request rejection, not in-flight cancellation)", async () => {
    stubHandlerThatTakes(1, pureOk);
    const { handleMessage } = await loadAdapter();

    handleMessage({ ...planRequest, request_id: "req-new", plan_revision: 10 });
    handleWorkerMessage.mockClear();
    const stale = handleMessage({ ...planRequest, request_id: "req-old", plan_revision: 5 });

    expect(stale).toMatchObject({ type: "ERROR", request_id: "req-old", code: "CANCELLED" });
    expect(handleWorkerMessage).not.toHaveBeenCalled();
  });
});
