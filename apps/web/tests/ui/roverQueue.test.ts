/**
 * Tests for RoverQueue (T29.05, FR-41, NFR-05, 04 §E.10).
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoverQueue } from "../../src/ui/ops/RoverQueue";
import type { Vehicle } from "@marswalk/protocol";

describe("T29.05 RoverQueue (SCR-11 utility rover card)", () => {
  const mockVehicle: Vehicle = {
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
  };

  it("renders empty state when no tasks are queued or active", () => {
    const emptyVehicle: Vehicle = {
      ...mockVehicle,
      state: "PARKED",
      task: null,
      eta_s: null,
    };

    const html = renderToStaticMarkup(
      React.createElement(RoverQueue, { vehicle: emptyVehicle })
    );

    expect(html).toContain("UR1");
    expect(html).toContain("PARKED");
    expect(html).toContain("No queued tasks");
  });

  it("renders active task with ETA and battery, each having data-provenance (FR-41, NFR-05)", () => {
    const html = renderToStaticMarkup(
      React.createElement(RoverQueue, { vehicle: mockVehicle })
    );

    expect(html).toContain("UR1");
    expect(html).toContain("RELAY");
    expect(html).toContain("EN_ROUTE");

    // ETA displayed with unit and provenance
    expect(html).toContain("180");
    expect(html).toContain("s");
    expect(html).toContain("data-provenance=\"modelled\"");

    // Battery displayed with unit and provenance
    expect(html).toContain("850");
    expect(html).toContain("Wh");
    expect(html).toContain("data-provenance=\"simulated\"");
  });

  it("renders queued tasks with item details for CARRY task", () => {
    const carryVehicle: Vehicle = {
      ...mockVehicle,
      task: {
        kind: "CARRY",
        target: { x_m: 1200, y_m: 1400 },
        item: "Sample Box 4",
      },
      eta_s: 300,
    };

    const queuedTasks = [
      {
        taskId: "task-2",
        kind: "SCOUT" as const,
        target: { x_m: 1800, y_m: 2000 },
        eta_s: 600,
        battery_wh: 720,
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(RoverQueue, {
        vehicle: carryVehicle,
        queuedTasks,
      })
    );

    expect(html).toContain("CARRY");
    expect(html).toContain("Sample Box 4");
    expect(html).toContain("SCOUT");
    expect(html).toContain("600");
  });
});
