import type { ComputePlanRequest } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { makePlaneGrid } from "../../../apps/web/tests/fixtures/grids";
import { handleWorkerMessage, handleWorkerMessageAsync } from "../src/handler";

const grid = makePlaneGrid({ width: 30, height: 30, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });

const request: ComputePlanRequest = {
  type: "COMPUTE_PLAN",
  request_id: "req-cancel",
  plan_revision: 1,
  site_id: "gale_boxwork",
  data_version: "2026.11.05",
  scenario: {
    eva_start_utc: "2026-11-14T08:00:00Z",
    max_eva_duration_h: 6.0,
    dwell_min_per_stop: 20,
    hard_slope_limit_deg: 15,
    caution_slope_deg: 10,
    walkback_limit_km: 5.0,
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
    { id: "wp-1", role: "stop", x_m: 137.5, y_m: -137.5 },
  ],
};

// 02 §E.2, BD-41: a search that is cancelled while it runs ends the request with ERROR CANCELLED. No stub: the real
// search runs and the flag is read at the real check interval.
describe("handleWorkerMessage with a cancelled search (02 §E.2, BD-41)", () => {
  it("answers ERROR CANCELLED with the request_id, not TIMEOUT or INTERNAL, when the flag is already set at the first check", () => {
    const response = handleWorkerMessage(grid, request, undefined, { shouldCancel: () => true, cancellationInterval: 10 });
    expect(response).toMatchObject({ type: "ERROR", request_id: "req-cancel", code: "CANCELLED" });
  });

  it("completes normally when the flag never flips", () => {
    const response = handleWorkerMessage(grid, request, undefined, { shouldCancel: () => false, cancellationInterval: 10 });
    expect(response.type).toBe("PLAN_RESULT");
  });

  it("checks the flag after every yield, not once", async () => {
    let checks = 0;
    const response = await handleWorkerMessageAsync(grid, request, {
      yieldToLoop: () => new Promise((resolve) => setTimeout(resolve, 0)),
      cancellationInterval: 10,
      shouldCancel: () => ++checks >= 3,
    });
    expect(checks).toBe(3);
    expect(response).toMatchObject({ type: "ERROR", code: "CANCELLED" });
  });
});
