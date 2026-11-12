/**
 * T11.01 / FD-142: the committed regression test that replaced T11.05's uncommitted scratch script.
 *
 * FR-14 says re-loading the export "in a test" reproduces the plan. This file loads an export back
 * into a plan store and recomputes: the metrics are identical and so is `plan_hash` (the hash covers
 * `{data_version, scenario, waypoints}`, so an unchanged plan keeps it whatever the result is).
 */
import { describe, expect, it } from "vitest";
import type { Leg, PlanExport, Site } from "@marswalk/protocol";
import { exportPlan, planHash } from "../../src/export/planExport";
import { createPlanStore, type PlanState } from "../../src/state/planStore";
import { SCENARIO, WAYPOINTS, resultOf, stateOf } from "../ui/planStoreFake";
import { mockManifest } from "../ui/map/mapFixtures";

/** The F4 mock site's own manifest (the file the app fetches), so the export reads the real ids. */
function siteOf(): Site {
  return mockManifest();
}

/** The one OK leg of the fixture plan (05 §C Leg). */
function okLeg(): Leg {
  return {
    from: "wp-0",
    to: "wp-1",
    status: "OK",
    distance_m: 6120,
    walk_time_min: 128,
    climb_m: 74,
    descent_m: 74,
    max_slope_deg: 12.6,
    geometry: [
      [0, 0],
      [100, 100],
    ],
    cell_path_length: 6125,
    profile: { dist_m: [0, 50, 100], elev_m: [0, 1, 2], slope_class: ["ok", "caution", "ok"] },
  };
}

function okState(): PlanState {
  return stateOf({
    status: "OK",
    result: resultOf({
      legs: [okLeg()],
      totals: {
        distance_m: 6120,
        walk_time_min: 128,
        dwell_time_min: 20,
        eva_total_min: 148,
        eva_margin_min: 212,
        climb_m: 74,
        descent_m: 74,
        max_slope_deg: 12.6,
        max_walkback_km: 3.06,
      },
    }),
  });
}

/** The metrics an export shows (05 §C PlanResult.totals), in a comparable shape. */
function metricsOf(state: PlanState): Record<string, number | null> {
  const totals = state.result?.totals ?? null;
  return {
    distance_m: totals?.distance_m ?? null,
    walk_time_min: totals?.walk_time_min ?? null,
    dwell_time_min: totals?.dwell_time_min ?? null,
    eva_total_min: totals?.eva_total_min ?? null,
    eva_margin_min: totals?.eva_margin_min ?? null,
    climb_m: totals?.climb_m ?? null,
    descent_m: totals?.descent_m ?? null,
    max_slope_deg: totals?.max_slope_deg ?? null,
    max_walkback_km: totals?.max_walkback_km ?? null,
  };
}

describe("plan export reload (T11.01, FD-142)", () => {
  it("reload reproduces metrics", async () => {
    const site = siteOf();
    const before = okState();
    const exported = exportPlan(site, before);

    // Reload: the export's scenario and waypoints go back into a fresh store, and the plan is
    // recomputed. The worker is a stand-in that answers the same result the export carries.
    const workerClient = {
      computePlan: async () => ({
        type: "PLAN_RESULT" as const,
        request_id: "r-1",
        plan_revision: 1,
        ...(before.result as NonNullable<PlanState["result"]>),
      }),
      retry: () => {},
      isCrashed: () => false,
    };
    const store = createPlanStore(
      { scenario: exported.scenario, waypoints: exported.waypoints },
      { workerClient, siteId: exported.site_id, dataVersion: exported.data_version },
    );
    // The recompute is asynchronous (03 §E.3), so the result is awaited through the store's
    // subscription before the metrics are compared.
    const computed = new Promise<PlanState>((resolve) => {
      const stop = store.subscribe((state) => {
        if (state.result === null) return;
        stop();
        resolve(state);
      });
    });
    store.loadPlan(exported.scenario, exported.waypoints);
    const after = await computed;

    expect(metricsOf(after)).toEqual(metricsOf(before));
    expect(after.scenario).toEqual(exported.scenario);
    expect(after.waypoints).toEqual(exported.waypoints);
  });

  it("reload reproduces metrics: the plan_hash is unchanged", () => {
    const site = siteOf();
    const exported = exportPlan(site, okState());
    const reloaded: PlanExport = JSON.parse(JSON.stringify(exported)) as PlanExport;
    expect(
      planHash({ data_version: reloaded.data_version, scenario: reloaded.scenario, waypoints: reloaded.waypoints }),
    ).toBe(exported.plan_hash);
  });

  it("reload reproduces metrics: the JSON round trip is lossless for the hash input", () => {
    const site = siteOf();
    const state = okState();
    const exported = exportPlan(site, state);
    const text = JSON.stringify(exported);
    const parsed = JSON.parse(text) as PlanExport;
    expect(
      planHash({ data_version: parsed.data_version, scenario: parsed.scenario, waypoints: parsed.waypoints }),
    ).toBe(exported.plan_hash);
    expect(parsed.scenario).toEqual(SCENARIO);
    expect(parsed.waypoints).toEqual(WAYPOINTS);
  });
});
