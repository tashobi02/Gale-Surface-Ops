import { describe, it, expect, vi } from "vitest";
import { createRouteLayer } from "../../src/ui/map/routeLayer";
import { LAYER_Z_INDEX } from "../../src/ui/context";
import type { PlanState, PlanStore } from "../../src/state/planStore";
import type { PlanResult, OkLeg, NoRouteLeg, Warning } from "@marswalk/protocol";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import LineString from "ol/geom/LineString.js";

function createMockPlanStore(initialState: Partial<PlanState> = {}): {
  store: PlanStore;
  emit: (state: PlanState) => void;
} {
  let currentState: PlanState = {
    scenario: {} as any,
    waypoints: [
      { id: "wp-0", role: "start", x_m: 0, y_m: 0, label: "Start" },
      { id: "wp-1", role: "stop", x_m: 100, y_m: 100, label: "Stop 1" },
    ],
    plan_revision: 1,
    status: "OK",
    result: null,
    last_error_code: null,
    can_undo: false,
    selected_waypoint_id: null,
    hover: null,
    ...initialState,
  };

  const listeners = new Set<(state: PlanState) => void>();

  const store: PlanStore = {
    get: () => currentState,
    setScenario: vi.fn(),
    setWaypoints: vi.fn(),
    undo: vi.fn(),
    subscribe: (fn: (state: PlanState) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  } as unknown as PlanStore;

  const emit = (state: PlanState) => {
    currentState = state;
    for (const l of listeners) l(state);
  };

  return { store, emit };
}

describe("T09.01 Route Layer (createRouteLayer)", () => {
  it("initialises an OpenLayers VectorLayer with LAYER_Z_INDEX.ROUTE", () => {
    const { store } = createMockPlanStore();
    const layer = createRouteLayer(store);

    expect(layer).toBeInstanceOf(VectorLayer);
    expect(layer.getZIndex()).toBe(LAYER_Z_INDEX.ROUTE);
  });

  it("renders OK legs as cased lines and clears when plan is empty", () => {
    const { store, emit } = createMockPlanStore();
    const layer = createRouteLayer(store);
    const source = layer.getSource() as VectorSource;

    const okLeg: OkLeg = {
      from: "wp-0",
      to: "wp-1",
      status: "OK",
      distance_m: 141.4,
      walk_time_min: 15,
      climb_m: 10,
      descent_m: 0,
      max_slope_deg: 5,
      geometry: [
        [0, 0],
        [50, 50],
        [100, 100],
      ],
      cell_path_length: 30,
      profile: {
        dist_m: [0, 70, 141.4],
        elev_m: [100, 105, 110],
        slope_class: ["ok", "ok", "ok"],
      },
    };

    const result: PlanResult = {
      status: "OK",
      legs: [okLeg],
      totals: null,
      stops_timeline: [],
      warnings: [],
      computed_utc: new Date().toISOString(),
      timing_ms: {},
    };

    emit({
      ...store.get(),
      status: "OK",
      result,
    });

    const features = source.getFeatures();
    expect(features.length).toBeGreaterThanOrEqual(1);

    const legFeature = features.find((f) => f.get("legIndex") === 0);
    expect(legFeature).toBeDefined();
    const geom = legFeature?.getGeometry() as LineString;
    expect(geom.getCoordinates()).toEqual([
      [0, 0],
      [50, 50],
      [100, 100],
    ]);

    // Clear when empty
    emit({
      ...store.get(),
      status: "Empty",
      result: null,
    });

    expect(source.getFeatures().length).toBe(0);
  });

  it("renders NO_ROUTE leg as dashed line to nearest_reachable", () => {
    const { store, emit } = createMockPlanStore();
    const layer = createRouteLayer(store);
    const source = layer.getSource() as VectorSource;

    const noRouteLeg: NoRouteLeg = {
      from: "wp-0",
      to: "wp-1",
      status: "NO_ROUTE",
      reason: "DISCONNECTED_BY_SLOPE",
      nearest_reachable: { x_m: 40, y_m: 40 },
    };

    const result: PlanResult = {
      status: "PARTIAL",
      legs: [noRouteLeg],
      totals: null,
      stops_timeline: [],
      warnings: [],
      computed_utc: new Date().toISOString(),
      timing_ms: {},
    };

    emit({
      ...store.get(),
      status: "Partial" as any,
      result,
    });

    const features = source.getFeatures();
    const noRouteFeature = features.find((f) => f.get("type") === "no_route_leg");
    expect(noRouteFeature).toBeDefined();

    const geom = noRouteFeature?.getGeometry() as LineString;
    expect(geom.getCoordinates()).toEqual([
      [0, 0],
      [40, 40],
    ]);
  });

  it("renders hazard segments along route when warnings have from_m/to_m", () => {
    const { store, emit } = createMockPlanStore();
    const layer = createRouteLayer(store);
    const source = layer.getSource() as VectorSource;

    const okLeg: OkLeg = {
      from: "wp-0",
      to: "wp-1",
      status: "OK",
      distance_m: 100,
      walk_time_min: 10,
      climb_m: 0,
      descent_m: 0,
      max_slope_deg: 12,
      geometry: [
        [0, 0],
        [100, 0],
      ],
      cell_path_length: 20,
      profile: {
        dist_m: [0, 50, 100],
        elev_m: [0, 0, 0],
        slope_class: ["ok", "caution", "ok"],
      },
    };

    const warning: Warning = {
      code: "CAUTION_SLOPE",
      severity: "caution",
      leg: 0,
      from_m: 30,
      to_m: 70,
      message: "Caution slope section",
    };

    const result: PlanResult = {
      status: "OVER_LIMITS",
      legs: [okLeg],
      totals: null,
      stops_timeline: [],
      warnings: [warning],
      computed_utc: new Date().toISOString(),
      timing_ms: {},
    };

    emit({
      ...store.get(),
      status: "OverLimits" as any,
      result,
    });

    const hazardFeatures = source.getFeatures().filter((f) => f.get("type") === "hazard_segment");
    expect(hazardFeatures.length).toBe(1);
    expect(hazardFeatures[0].get("severity")).toBe("caution");
  });
});
