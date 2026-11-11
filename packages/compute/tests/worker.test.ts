import type { ComputePlanRequest, SamplePointRequest } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { makePlaneGrid, makeWallWithGapGrid } from "../../../apps/web/tests/fixtures/grids";
import { handleMessage, setWorkerGrid } from "../../../apps/web/src/worker/planWorker";
import { handleWorkerMessage } from "../src/handler";

const testGrid = makePlaneGrid({
  width: 20,
  height: 20,
  cell_m: 5,
  slope_deg: 0,
  origin_m: [0, 0],
});

const defaultComputeRequest: ComputePlanRequest = {
  type: "COMPUTE_PLAN",
  request_id: "req-001",
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
    loop: true,
    max_haven_min: 30,
    crew_count: 2,
    vehicle_available: true,
  },
  waypoints: [
    { id: "wp-0", role: "start", x_m: 12.5, y_m: -12.5 },
    { id: "wp-1", role: "stop", x_m: 37.5, y_m: -12.5 },
    { id: "wp-2", role: "stop", x_m: 37.5, y_m: -37.5 },
  ],
};

// docs/specs/02 §E.2 worker message protocol (FR-03, FR-07, NFR-02, NFR-06, NFR-10). TASK-05 (T05.15).
describe("compute worker handler and entry", () => {
  describe("handleWorkerMessage", () => {
    it("returns GRID_NOT_LOADED error when grid is null", () => {
      const response = handleWorkerMessage(null, defaultComputeRequest);
      expect(response.type).toBe("ERROR");
      if (response.type === "ERROR") {
        expect(response.request_id).toBe("req-001");
        expect(response.code).toBe("GRID_NOT_LOADED");
      }
    });

    it("handles SAMPLE_POINT and returns SAMPLE_RESULT echoing request_id", () => {
      const sampleReq: SamplePointRequest = {
        type: "SAMPLE_POINT",
        request_id: "sample-42",
        x_m: 12.5,
        y_m: -12.5,
        snap_radius_m: 50,
      };

      const response = handleWorkerMessage(testGrid, sampleReq);
      expect(response.type).toBe("SAMPLE_RESULT");
      if (response.type === "SAMPLE_RESULT") {
        expect(response.request_id).toBe("sample-42");
        expect(response.inside_aoi).toBe(true);
        expect(response.passable).toBe(true);
        expect(typeof response.elevation_m).toBe("number");
        expect(typeof response.lat).toBe("number");
        expect(typeof response.lon_e).toBe("number");
      }
    });

    it("handles COMPUTE_PLAN with loop: true (3 waypoints -> 3 legs)", () => {
      const response = handleWorkerMessage(testGrid, defaultComputeRequest);
      expect(response.type).toBe("PLAN_RESULT");
      if (response.type === "PLAN_RESULT") {
        expect(response.request_id).toBe("req-001");
        expect(response.plan_revision).toBe(1);
        expect(response.status).toBe("OK");
        // 3 legs: wp-0 -> wp-1, wp-1 -> wp-2, wp-2 -> wp-0 (loop return)
        expect(response.legs).toHaveLength(3);
        expect(response.legs[0].from).toBe("wp-0");
        expect(response.legs[0].to).toBe("wp-1");
        expect(response.legs[1].from).toBe("wp-1");
        expect(response.legs[1].to).toBe("wp-2");
        expect(response.legs[2].from).toBe("wp-2");
        expect(response.legs[2].to).toBe("wp-0");

        // Totals must be present on OK status
        expect(response.totals).not.toBeNull();
        expect(response.totals!.distance_m).toBeGreaterThan(0);
        expect(response.totals!.walk_time_min).toBeGreaterThan(0);
      }
    });

    it("handles COMPUTE_PLAN with loop: false (3 waypoints -> 2 legs)", () => {
      const oneWayReq: ComputePlanRequest = {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, loop: false },
      };

      const response = handleWorkerMessage(testGrid, oneWayReq);
      expect(response.type).toBe("PLAN_RESULT");
      if (response.type === "PLAN_RESULT") {
        expect(response.legs).toHaveLength(2);
        expect(response.legs[0].from).toBe("wp-0");
        expect(response.legs[0].to).toBe("wp-1");
        expect(response.legs[1].from).toBe("wp-1");
        expect(response.legs[1].to).toBe("wp-2");
      }
    });

    it("returns INVALID_INPUT error for invalid scenario constraints", () => {
      const invalidReq: ComputePlanRequest = {
        ...defaultComputeRequest,
        scenario: { ...defaultComputeRequest.scenario, hard_slope_limit_deg: 50 }, // out of range
      };

      const response = handleWorkerMessage(testGrid, invalidReq);
      expect(response.type).toBe("ERROR");
      if (response.type === "ERROR") {
        expect(response.code).toBe("INVALID_INPUT");
        expect(response.request_id).toBe("req-001");
      }
    });

    it("returns TIMEOUT error when search node expansions exceeded", () => {
      // Pass tiny maxExpansions by testing a blocked/huge search or injecting maxExpansions
      // In a wall grid where search exhausts expansions:
      const grid = makePlaneGrid({ width: 30, height: 30, cell_m: 5, slope_deg: 0, origin_m: [0, 0] });
      const req: ComputePlanRequest = {
        ...defaultComputeRequest,
        waypoints: [
          { id: "wp-0", role: "start", x_m: 10, y_m: -10 },
          { id: "wp-1", role: "stop", x_m: 140, y_m: -140 },
        ],
      };

      // When called with maxExpansions override = 5
      const response = handleWorkerMessage(grid, req, 5);
      expect(response.type).toBe("ERROR");
      if (response.type === "ERROR") {
        expect(response.code).toBe("TIMEOUT");
      }
    });

    it("gives identical output for repeated identical requests (NFR-06 determinism)", () => {
      const res1 = handleWorkerMessage(testGrid, defaultComputeRequest);
      const res2 = handleWorkerMessage(testGrid, defaultComputeRequest);

      expect(res1.type).toBe("PLAN_RESULT");
      expect(res2.type).toBe("PLAN_RESULT");

      if (res1.type === "PLAN_RESULT" && res2.type === "PLAN_RESULT") {
        // Compare every field except computed_utc and timing_ms per 05 §D
        expect(res1.status).toBe(res2.status);
        expect(res1.totals).toEqual(res2.totals);
        expect(res1.legs).toEqual(res2.legs);
        expect(res1.warnings).toEqual(res2.warnings);
      }
    });

    it("is pure and deterministic when passed explicit wall-clock time", () => {
      const fixedMs = 1700000000000;
      const res1 = handleWorkerMessage(testGrid, defaultComputeRequest, undefined, fixedMs);
      const res2 = handleWorkerMessage(testGrid, defaultComputeRequest, undefined, fixedMs);

      expect(res1).toEqual(res2);
      if (res1.type === "PLAN_RESULT") {
        expect(res1.computed_utc).toBe(new Date(fixedMs).toISOString());
        expect(res1.timing_ms.estimates).toBeUndefined();
        // Dwell stops counted from waypoints with role === 'stop' (2 stops out of 3 waypoints)
        expect(res1.totals?.dwell_time_min).toBe(2 * defaultComputeRequest.scenario.dwell_min_per_stop);
      }
    });
  });

  describe("planWorker entry and cancellation (T05.27)", () => {
    it("cancels superseded plan_revision and answers older requests with CANCELLED (02 §E.2)", () => {
      setWorkerGrid(testGrid);

      // Process revision 10
      const reqRev10: ComputePlanRequest = {
        ...defaultComputeRequest,
        request_id: "req-rev10",
        plan_revision: 10,
      };
      const res10 = handleMessage(reqRev10);
      expect(res10.type).toBe("PLAN_RESULT");

      // Now revision 5 arrives later (superseded)
      const reqRev5: ComputePlanRequest = {
        ...defaultComputeRequest,
        request_id: "req-rev5",
        plan_revision: 5,
      };
      const res5 = handleMessage(reqRev5);
      expect(res5.type).toBe("ERROR");
      if (res5.type === "ERROR") {
        expect(res5.request_id).toBe("req-rev5");
        expect(res5.code).toBe("CANCELLED");
      }
    });
  });
});
