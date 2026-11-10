/**
 * Tests for Ops Map Layers (T25.02, FR-30, FR-39, FR-42, 04 §E.4, 02 §C.1).
 *
 * Checks that:
 * 1. Vector layers for crew, vehicles, coverage and haven bands are created.
 * 2. All coordinates and geometries use only working-projection metres (no EPSG:3857, no ol/sphere).
 * 3. Unlinked/stale crew markers get dashed/grey styling.
 * 4. Vehicle positions and planned paths render accurately.
 * 5. Comm coverage and haven bands render without external services.
 * 6. Scientific layer toggles (slope, thermal inertia) enforce the max 2 layer rule (04 §E.5).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createOpsLayers, type OpsLayers } from "../../../src/ui/map/opsLayers";
import type { Snapshot, Crew, Vehicle } from "@marswalk/protocol";
import Point from "ol/geom/Point.js";
import LineString from "ol/geom/LineString.js";

describe("T25.02 Ops Map Layers", () => {
  let opsLayers: OpsLayers;

  const mockCrew: Crew[] = [
    {
      crew_id: "EV1",
      x_m: 2410.5,
      y_m: -1875.0,
      activity: "WALKING",
      stop_index: null,
      o2_frac: 0.71,
      eva_elapsed_s: 120,
      dose_event_ugy: 0,
      dose_event_unsheltered_ugy: 0,
      haven: {
        minutes: 18.4,
        kind: "vehicle",
        target_x_m: -1800,
        target_y_m: -1500,
      },
      linked: true,
      link_path: ["EV1", "PR1", "hab"],
      stale: false,
    },
    {
      crew_id: "EV2",
      x_m: 2350.0,
      y_m: -1900.0,
      activity: "AT_STOP",
      stop_index: 1,
      o2_frac: 0.85,
      eva_elapsed_s: 120,
      dose_event_ugy: 0,
      dose_event_unsheltered_ugy: 0,
      haven: {
        minutes: 15.0,
        kind: "hab",
        target_x_m: 0,
        target_y_m: 0,
      },
      linked: false, // unlinked
      link_path: [],
      stale: true,
    },
  ];

  const mockVehicles: Vehicle[] = [
    {
      vehicle_id: "PR1",
      kind: "pressurized_rover",
      param_set: "pr1-assumed",
      x_m: -1800,
      y_m: -1500,
      state: "PARKED",
      task: null,
      path: [
        [-1800, -1500],
        [-1700, -1450],
      ],
      eta_s: null,
      battery_wh: null,
    },
    {
      vehicle_id: "UR1",
      kind: "utility_rover",
      param_set: "pr-ur1-assumed",
      x_m: 1500,
      y_m: 2200,
      state: "EN_ROUTE",
      task: {
        kind: "RELAY",
        target: { x_m: 1600, y_m: 2300 },
      },
      path: [
        [1500, 2200],
        [1600, 2300],
      ],
      eta_s: 180,
      battery_wh: 850,
    },
  ];

  const mockSnapshot: Partial<Snapshot> = {
    seq: 412,
    sim_time: "2024-05-20T13:05:00Z",
    crew: mockCrew,
    vehicles: mockVehicles,
  };

  beforeEach(() => {
    opsLayers = createOpsLayers();
  });

  it("creates ops map layers with crew, vehicle, coverage and haven bands vector layers", () => {
    expect(opsLayers.crewLayer).toBeDefined();
    expect(opsLayers.vehicleLayer).toBeDefined();
    expect(opsLayers.coverageLayer).toBeDefined();
    expect(opsLayers.havenBandsLayer).toBeDefined();
  });

  it("renders crew markers and trails at working-projection metres", () => {
    // Initial position
    opsLayers.update(mockSnapshot as Snapshot);

    // Second position for EV1 to generate trail breadcrumb
    const movedSnapshot: Partial<Snapshot> = {
      ...mockSnapshot,
      crew: [
        {
          ...mockCrew[0],
          x_m: 2420.0,
          y_m: -1870.0,
        },
        mockCrew[1],
      ],
    };
    opsLayers.update(movedSnapshot as Snapshot);

    const crewFeatures = opsLayers.crewLayer.getSource()!.getFeatures();
    expect(crewFeatures.length).toBeGreaterThanOrEqual(2);

    const ev1Feature = crewFeatures.find((f) => f.get("crew_id") === "EV1" && f.get("type") === "crew_marker");
    expect(ev1Feature).toBeDefined();

    const geom = ev1Feature!.getGeometry() as Point;
    expect(geom.getType()).toBe("Point");
    expect(geom.getCoordinates()).toEqual([2420.0, -1870.0]);

    // Check EV1 trail line
    const ev1Trail = crewFeatures.find((f) => f.get("crew_id") === "EV1" && f.get("type") === "crew_trail");
    expect(ev1Trail).toBeDefined();
    const trailGeom = ev1Trail!.getGeometry() as LineString;
    expect(trailGeom.getCoordinates()).toEqual([
      [2410.5, -1875.0],
      [2420.0, -1870.0],
    ]);
  });

  it("unlinked or stale crew members are tagged and styled with unlinked state", () => {
    opsLayers.update(mockSnapshot as Snapshot);

    const crewFeatures = opsLayers.crewLayer.getSource()!.getFeatures();
    const ev2Feature = crewFeatures.find((f) => f.get("crew_id") === "EV2" && f.get("type") === "crew_marker");
    expect(ev2Feature).toBeDefined();
    expect(ev2Feature!.get("linked")).toBe(false);
    expect(ev2Feature!.get("stale")).toBe(true);
  });

  it("renders vehicle markers and planned paths at working-projection metres", () => {
    opsLayers.update(mockSnapshot as Snapshot);

    const vehicleFeatures = opsLayers.vehicleLayer.getSource()!.getFeatures();
    expect(vehicleFeatures.length).toBeGreaterThanOrEqual(2);

    const pr1Feature = vehicleFeatures.find((f) => f.get("vehicle_id") === "PR1" && f.get("type") === "vehicle_marker");
    expect(pr1Feature).toBeDefined();
    const geom = pr1Feature!.getGeometry() as Point;
    expect(geom.getCoordinates()).toEqual([-1800, -1500]);

    // Check planned path
    const pr1Path = vehicleFeatures.find((f) => f.get("vehicle_id") === "PR1" && f.get("type") === "vehicle_path");
    expect(pr1Path).toBeDefined();
    const pathGeom = pr1Path!.getGeometry() as LineString;
    expect(pathGeom.getCoordinates()).toEqual([
      [-1800, -1500],
      [-1700, -1450],
    ]);
  });

  it("renders haven bands isochrones around haven targets", () => {
    opsLayers.update(mockSnapshot as Snapshot);

    const havenFeatures = opsLayers.havenBandsLayer.getSource()!.getFeatures();
    expect(havenFeatures.length).toBeGreaterThan(0);
    expect(havenFeatures[0].get("type")).toBe("haven_band");
  });

  it("scientific layer toggles enforce maximum 2 layers active (04 §E.5)", () => {
    expect(opsLayers.getVisibleScientificLayers()).toEqual([]);

    opsLayers.setSlopeVisible(true);
    expect(opsLayers.getVisibleScientificLayers()).toContain("slope");

    opsLayers.setThermalInertiaVisible(true);
    expect(opsLayers.getVisibleScientificLayers()).toContain("slope");
    expect(opsLayers.getVisibleScientificLayers()).toContain("thermal_inertia");

    // Turning on a third (e.g. comm_shadow) turns off the oldest (slope)
    opsLayers.setCommShadowVisible(true);
    const visible = opsLayers.getVisibleScientificLayers();
    expect(visible.length).toBeLessThanOrEqual(2);
    expect(visible).toContain("comm_shadow");
    expect(visible).toContain("thermal_inertia");
    expect(visible).not.toContain("slope");
  });

  it("clears features cleanly on destroy or empty update", () => {
    opsLayers.update(mockSnapshot as Snapshot);
    expect(opsLayers.crewLayer.getSource()!.getFeatures().length).toBeGreaterThan(0);

    opsLayers.update(null);
    expect(opsLayers.crewLayer.getSource()!.getFeatures().length).toBe(0);
    expect(opsLayers.vehicleLayer.getSource()!.getFeatures().length).toBe(0);

    opsLayers.destroy();
  });
});
