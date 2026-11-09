/**
 * Adapter over the real pure handler (docs/specs/02 §E.2, NFR-06; TASK-05 T05.15, T05.32).
 * No mocks: a routed plan through `handleMessage` carries a real ISO timestamp and only the
 * measured total, and the pure handler's own output stays reproducible without them.
 */
import type { ComputePlanRequest, PlanResultMessage } from "@marswalk/protocol";
import { handleWorkerMessage } from "@marswalk/compute";
import { describe, expect, it } from "vitest";
import { makePlaneGrid } from "../fixtures/grids";
import { handleMessage, setWorkerGrid } from "../../src/worker/planWorker";

const grid = makePlaneGrid({ width: 20, height: 20, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });

const request: ComputePlanRequest = {
  type: "COMPUTE_PLAN",
  request_id: "req-real",
  plan_revision: 1,
  site_id: "gale_boxwork",
  data_version: "2026.11.05",
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
    { id: "wp-0", role: "start", x_m: 12.5, y_m: -12.5 },
    { id: "wp-1", role: "stop", x_m: 37.5, y_m: -12.5 },
  ],
};

describe("planWorker adapter with the real pure handler", () => {
  it("adds a real ISO timestamp and a finite measured total, and nothing else, to timing_ms", () => {
    setWorkerGrid(grid);
    const before = Date.now();
    const response = handleMessage(request) as PlanResultMessage;
    const after = Date.now();

    expect(response.type).toBe("PLAN_RESULT");
    expect(new Date(response.computed_utc).toISOString()).toBe(response.computed_utc);
    expect(Date.parse(response.computed_utc)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(response.computed_utc)).toBeLessThanOrEqual(after);
    expect(Object.keys(response.timing_ms)).toEqual(["total"]);
    expect(Number.isFinite(response.timing_ms.total)).toBe(true);
    expect(response.timing_ms.total).toBeGreaterThanOrEqual(0);
  });

  it("leaves the pure handler output free of run metadata and identical across repeats", () => {
    const first = handleWorkerMessage(grid, request);
    const second = handleWorkerMessage(grid, request);

    expect(first.type).toBe("PLAN_RESULT");
    expect(first).not.toHaveProperty("computed_utc");
    expect(first).not.toHaveProperty("timing_ms");
    expect(second).toEqual(first);
  });
});
