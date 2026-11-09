import { describe, expect, it } from "vitest";
import type { ComputePlanRequest, SamplePointRequest } from "@marswalk/protocol";
import {
  getResultVariantFromUrl,
  handleMockWorkerMessage,
  MOCK_SAMPLE_RESULT_BASE,
} from "./mockWorker";

describe("F3 — Mock worker (T05.04)", () => {
  const dummyPlanRequest: ComputePlanRequest = {
    type: "COMPUTE_PLAN",
    request_id: "req-9999",
    plan_revision: 42,
    site_id: "gale_boxwork",
    data_version: "gale_boxwork-2026.11.05",
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
      vehicle_available: false,
    },
    waypoints: [
      { id: "wp-0", role: "start", x_m: 1000, y_m: 2000 },
      { id: "wp-1", role: "stop", x_m: 1500, y_m: 2200 },
    ],
  };

  const dummySampleRequest: SamplePointRequest = {
    type: "SAMPLE_POINT",
    request_id: "req-sample-01",
    x_m: 2990.0,
    y_m: -2595.0,
    snap_radius_m: 50,
  };

  it("handles SAMPLE_POINT and echoes request_id with verbatim 02 §E.2 data", () => {
    const response = handleMockWorkerMessage(dummySampleRequest);

    expect(response.type).toBe("SAMPLE_RESULT");
    if (response.type === "SAMPLE_RESULT") {
      expect(response.request_id).toBe("req-sample-01");
      expect(response.inside_aoi).toBe(true);
      expect(response.passable).toBe(false);
      expect(response.reason).toBe("SLOPE_OVER_LIMIT");
      expect(response.elevation_m).toBe(-3912.4);
      expect(response.slope_p90_deg).toBe(21.75);
      expect(response.ti_tiu).toBe(312.0);
      expect(response.flags).toEqual(["LOW_RES_DEM"]);
      expect(response.snap).toEqual({ x_m: 2982.5, y_m: -2612.5, distance_m: 19.0 });
    }
  });

  it("handles COMPUTE_PLAN with default 'ok' fixture and echoes request_id and plan_revision", () => {
    const response = handleMockWorkerMessage(dummyPlanRequest, "ok");

    expect(response.type).toBe("PLAN_RESULT");
    if (response.type === "PLAN_RESULT") {
      expect(response.request_id).toBe("req-9999");
      expect(response.plan_revision).toBe(42);
      expect(response.status).toBe("OK");
      expect(response.totals?.distance_m).toBe(6120);
      expect(response.radiation?.dose_mSv).toBe(0.066);
    }
  });

  it("handles COMPUTE_PLAN with 'partial' fixture when selected", () => {
    const response = handleMockWorkerMessage(dummyPlanRequest, "partial");

    expect(response.type).toBe("PLAN_RESULT");
    if (response.type === "PLAN_RESULT") {
      expect(response.request_id).toBe("req-9999");
      expect(response.plan_revision).toBe(42);
      expect(response.status).toBe("PARTIAL");
      expect(response.totals).toBeNull();
      expect(response.legs[1].status).toBe("NO_ROUTE");
    }
  });

  it("handles COMPUTE_PLAN with 'over-limits' fixture when selected", () => {
    const response = handleMockWorkerMessage(dummyPlanRequest, "over-limits");

    expect(response.type).toBe("PLAN_RESULT");
    if (response.type === "PLAN_RESULT") {
      expect(response.request_id).toBe("req-9999");
      expect(response.plan_revision).toBe(42);
      expect(response.status).toBe("OVER_LIMITS");
      const warning = response.warnings.find((w) => w.code === "WALKBACK_EXCEEDED");
      expect(warning).toBeDefined();
      expect(warning?.severity).toBe("blocked");
    }
  });

  it("returns ERROR with code INTERNAL for unknown fixture variant", () => {
    const response = handleMockWorkerMessage(dummyPlanRequest, "unknown-variant");

    expect(response.type).toBe("ERROR");
    if (response.type === "ERROR") {
      expect(response.request_id).toBe("req-9999");
      expect(response.code).toBe("INTERNAL");
      expect(response.message).toContain("Unknown mock result variant");
    }
  });

  it("extracts query variant from URL accurately with defaults", () => {
    expect(getResultVariantFromUrl("blob:http://localhost/worker.js?result=partial")).toBe("partial");
    expect(getResultVariantFromUrl("http://localhost/mockWorker.js?result=over-limits")).toBe("over-limits");
    expect(getResultVariantFromUrl("http://localhost/mockWorker.js")).toBe("ok");
    expect(getResultVariantFromUrl("invalid-url-string")).toBe("ok");
  });
});
