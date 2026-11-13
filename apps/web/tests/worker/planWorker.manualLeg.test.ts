/**
 * The worker adapter and VALIDATE_MANUAL_LEG (T05.30, BD-150): the message reaches the real compute handler, is answered
 * MANUAL_LEG_RESULT, and takes no part in plan cancellation (a manual validation never cancels or is cancelled by a plan).
 */
import type { ComputePlanRequest, ManualLegResult, MissionScenario, ValidateManualLegRequest } from "@marswalk/protocol";
import { centreOfCell } from "@marswalk/compute";
import { describe, expect, it } from "vitest";
import { createPlanWorker } from "../../src/worker/planWorker";
import { makePlaneGrid } from "../fixtures/grids";

const scenario: MissionScenario = {
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
};

const grid = () => makePlaneGrid({ width: 20, height: 20, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
const manual = (g: ReturnType<typeof grid>): ValidateManualLegRequest => ({
  type: "VALIDATE_MANUAL_LEG",
  request_id: "m-1",
  plan_revision: 99,
  scenario,
  from: "wp-0",
  to: "wp-1",
  vertices: [centreOfCell(g.meta, 2 * 20 + 1), centreOfCell(g.meta, 2 * 20 + 6)],
});
const plan = (g: ReturnType<typeof grid>, revision: number): ComputePlanRequest => ({
  type: "COMPUTE_PLAN",
  request_id: `p-${revision}`,
  plan_revision: revision,
  site_id: "mock_site",
  data_version: "mock_site-2026.11.05",
  scenario,
  waypoints: [
    { id: "wp-0", role: "start", x_m: centreOfCell(g.meta, 2 * 20 + 1)[0], y_m: centreOfCell(g.meta, 2 * 20 + 1)[1] },
    { id: "wp-1", role: "stop", x_m: centreOfCell(g.meta, 2 * 20 + 6)[0], y_m: centreOfCell(g.meta, 2 * 20 + 6)[1] },
  ],
});

describe("createPlanWorker and VALIDATE_MANUAL_LEG", () => {
  it("answers MANUAL_LEG_RESULT from the real handler once a grid is set", async () => {
    const g = grid();
    const worker = createPlanWorker({ yieldToLoop: async () => undefined });
    worker.setGrid(g);
    const response = (await worker.handleMessage(manual(g))) as ManualLegResult;
    expect(response).toMatchObject({ type: "MANUAL_LEG_RESULT", request_id: "m-1", plan_revision: 99 });
    expect(response.leg).toMatchObject({ status: "OK", from: "wp-0", to: "wp-1", cell_path_length: 6 });
  });

  it("answers GRID_NOT_LOADED before a grid is loaded", async () => {
    const worker = createPlanWorker({ yieldToLoop: async () => undefined });
    expect(await worker.handleMessage(manual(grid()))).toMatchObject({ type: "ERROR", code: "GRID_NOT_LOADED" });
  });

  it("does not raise the latest plan revision: an older COMPUTE_PLAN still runs after a manual validation", async () => {
    const g = grid();
    const worker = createPlanWorker({ yieldToLoop: async () => undefined });
    worker.setGrid(g);
    await worker.handleMessage(manual(g)); // plan_revision 99
    const response = await worker.handleMessage(plan(g, 1));
    expect(response.type).toBe("PLAN_RESULT");
  });
});
