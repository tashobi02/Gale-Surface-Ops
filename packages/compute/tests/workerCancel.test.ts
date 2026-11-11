import type { ComputePlanRequest } from "@marswalk/protocol";
import { describe, expect, it, vi } from "vitest";
import { makePlaneGrid } from "../../../apps/web/tests/fixtures/grids";
import { handleWorkerMessage } from "../src/handler";

// searchLeg is stubbed: nothing in the handler passes `shouldCancel` yet (TODO(decision) in TASK-05 T05.18/T05.27),
// so this only pins how the handler reports a search that the route layer ended as CANCELLED (02 §E.2).
vi.mock("../src/route", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/route")>();
  return { ...actual, searchLeg: vi.fn(() => ({ status: "CANCELLED" as const })) };
});

const grid = makePlaneGrid({ width: 20, height: 20, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });

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
    { id: "wp-1", role: "stop", x_m: 37.5, y_m: -12.5 },
  ],
};

describe("handleWorkerMessage with a cancelled search (02 §E.2)", () => {
  it("answers ERROR CANCELLED with the request_id, not TIMEOUT or INTERNAL", () => {
    const response = handleWorkerMessage(grid, request);
    expect(response).toMatchObject({ type: "ERROR", request_id: "req-cancel", code: "CANCELLED" });
  });
});
