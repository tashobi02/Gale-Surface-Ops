import type { MissionScenario, Waypoint } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { evaTimeline, stepTimeH, suitedSpeedKmh } from "../src/timeModel";

// Helper converting degrees to dimensionless gradient S = tan(theta)
function degToGradient(deg: number): number {
  return Math.tan((deg * Math.PI) / 180);
}

// docs/specs/02 §D.3 reference values (FR-09); table values exact to 0.01 km/h (02 §F.1). TASK-05 (T05.11).
describe("suitedSpeedKmh (v0 = 3.3 km/h suited, v0 = 5.037 km/h unsuited Tobler)", () => {
  const TOBLER_V0 = 5.037;
  const SUITED_V0 = 3.3;

  it("0° → 5.04 unsuited, 3.30 suited", () => {
    const s = degToGradient(0);
    expect(Number(suitedSpeedKmh(s, TOBLER_V0).toFixed(2))).toBe(5.04);
    expect(Number(suitedSpeedKmh(s, SUITED_V0).toFixed(2))).toBe(3.3);
  });

  it("+5° → 3.71 unsuited, 2.43 suited", () => {
    const s = degToGradient(5);
    expect(Number(suitedSpeedKmh(s, TOBLER_V0).toFixed(2))).toBe(3.71);
    expect(Number(suitedSpeedKmh(s, SUITED_V0).toFixed(2))).toBe(2.43);
  });

  it("+10° → 2.72 unsuited, 1.78 suited", () => {
    const s = degToGradient(10);
    expect(Number(suitedSpeedKmh(s, TOBLER_V0).toFixed(2))).toBe(2.72);
    expect(Number(suitedSpeedKmh(s, SUITED_V0).toFixed(2))).toBe(1.78);
  });

  it("+15° → 1.97 unsuited, 1.29 suited", () => {
    const s = degToGradient(15);
    expect(Number(suitedSpeedKmh(s, TOBLER_V0).toFixed(2))).toBe(1.97);
    expect(Number(suitedSpeedKmh(s, SUITED_V0).toFixed(2))).toBe(1.29);
  });

  it("−5° → 5.26 unsuited, 3.45 suited", () => {
    const s = degToGradient(-5);
    expect(Number(suitedSpeedKmh(s, TOBLER_V0).toFixed(2))).toBe(5.26);
    expect(Number(suitedSpeedKmh(s, SUITED_V0).toFixed(2))).toBe(3.45);
  });

  it("−10° → 3.86 unsuited, 2.53 suited", () => {
    const s = degToGradient(-10);
    expect(Number(suitedSpeedKmh(s, TOBLER_V0).toFixed(2))).toBe(3.86);
    expect(Number(suitedSpeedKmh(s, SUITED_V0).toFixed(2))).toBe(2.53);
  });
});

describe("walking time", () => {
  it("1 km flat → 18.18 min (02 §D.3, FR-09)", () => {
    const timeH = stepTimeH(1000, 0, 3.3, 1.0);
    const timeMin = timeH * 60;
    expect(Number(timeMin.toFixed(2))).toBe(18.18);
  });

  it("1 km at constant +10° gradient → 3D length 1015.4 m, ≈ 34.2 min (02 §D.3)", () => {
    const horizontalDistM = 1000;
    const dzM = horizontalDistM * degToGradient(10);
    const length3DM = Math.hypot(horizontalDistM, dzM);

    expect(Number(length3DM.toFixed(1))).toBe(1015.4);

    const timeH = stepTimeH(horizontalDistM, dzM, 3.3, 1.0);
    const timeMin = timeH * 60;
    expect(Number(timeMin.toFixed(1))).toBe(34.2);
  });

  it("scales with caution and low-TI multipliers (02 §D.2)", () => {
    const baseTimeH = stepTimeH(100, 5, 3.3, 1.0);
    const cautionTimeH = stepTimeH(100, 5, 3.3, 1.5);
    const lowTiTimeH = stepTimeH(100, 5, 3.3, 1.3);

    expect(cautionTimeH).toBeCloseTo(baseTimeH * 1.5, 6);
    expect(lowTiTimeH).toBeCloseTo(baseTimeH * 1.3, 6);
  });

  it("EVA timeline adds dwell time per stop (02 §D.3, 05 §C PlanResult)", () => {
    const scenario: MissionScenario = {
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
    };

    const waypoints: Waypoint[] = [
      { id: "wp-0", role: "start", x_m: 0, y_m: 0 },
      { id: "wp-1", role: "stop", x_m: 500, y_m: 0 },
      { id: "wp-2", role: "stop", x_m: 1000, y_m: 0 },
      { id: "wp-3", role: "start", x_m: 0, y_m: 0 }, // return to hab
    ];

    // leg 0: 15 min walk, leg 1: 25 min walk, leg 2: 30 min walk
    const legWalkMin = [15, 25, 30];

    const timeline = evaTimeline(scenario, waypoints, legWalkMin);
    expect(timeline.length).toBe(4);

    // wp-0 (start): arrives 08:00, departs 08:00 (no dwell at start)
    expect(timeline[0].arrive_utc).toBe("2026-11-14T08:00:00.000Z");
    expect(timeline[0].depart_utc).toBe("2026-11-14T08:00:00.000Z");

    // wp-1 (stop): arrives 08:00 + 15 min = 08:15, dwells 20 min -> departs 08:35
    expect(timeline[1].arrive_utc).toBe("2026-11-14T08:15:00.000Z");
    expect(timeline[1].depart_utc).toBe("2026-11-14T08:35:00.000Z");

    // wp-2 (stop): arrives 08:35 + 25 min = 09:00, dwells 20 min -> departs 09:20
    expect(timeline[2].arrive_utc).toBe("2026-11-14T09:00:00.000Z");
    expect(timeline[2].depart_utc).toBe("2026-11-14T09:20:00.000Z");

    // wp-3 (return to start): arrives 09:20 + 30 min = 09:50, departs 09:50
    expect(timeline[3].arrive_utc).toBe("2026-11-14T09:50:00.000Z");
    expect(timeline[3].depart_utc).toBe("2026-11-14T09:50:00.000Z");
  });

  it("EVA timeline includes loop-closing leg for return to start (02 §D.3)", () => {
    const scenario: MissionScenario = {
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
    };

    // 2 waypoints (start + 1 stop) on a loop
    const waypoints: Waypoint[] = [
      { id: "wp-0", role: "start", x_m: 0, y_m: 0 },
      { id: "wp-1", role: "stop", x_m: 500, y_m: 0 },
    ];
    // leg 0 (start -> stop 1): 15 min; leg 1 (stop 1 -> return start): 15 min
    const legWalkMin = [15, 15];

    const timeline = evaTimeline(scenario, waypoints, legWalkMin);
    expect(timeline).toHaveLength(3);
    // start
    expect(timeline[0].arrive_utc).toBe("2026-11-14T08:00:00.000Z");
    expect(timeline[0].depart_utc).toBe("2026-11-14T08:00:00.000Z");
    // stop 1 (dwell 20 min)
    expect(timeline[1].arrive_utc).toBe("2026-11-14T08:15:00.000Z");
    expect(timeline[1].depart_utc).toBe("2026-11-14T08:35:00.000Z");
    // return to start (hab)
    expect(timeline[2].arrive_utc).toBe("2026-11-14T08:50:00.000Z");
    expect(timeline[2].depart_utc).toBe("2026-11-14T08:50:00.000Z");
  });

  describe("EVA timeline with unavailable inputs", () => {
    const scenario: MissionScenario = {
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
    };
    const waypoints: Waypoint[] = [
      { id: "wp-0", role: "start", x_m: 0, y_m: 0 },
      { id: "wp-1", role: "stop", x_m: 500, y_m: 0 },
    ];

    it("omits the loop return when its duration is missing, including a sparse array", () => {
      const sparseWalkTimes = [15];
      sparseWalkTimes.length = 2;
      expect(evaTimeline(scenario, waypoints, [15])).toHaveLength(2);
      const timeline = evaTimeline(scenario, waypoints, sparseWalkTimes);
      expect(timeline).toHaveLength(2);
      expect(timeline[1].depart_utc).toBe("2026-11-14T08:35:00.000Z");
    });

    it("rejects a missing walk time before a waypoint instead of inventing zero", () => {
      const missingWalkTimes: number[] = [];
      missingWalkTimes[1] = 15;
      expect(() => evaTimeline(scenario, waypoints, missingWalkTimes)).toThrow();
    });

    it("rejects a missing required dwell duration rather than assuming zero", () => {
      const withoutDwell = { ...scenario, dwell_min_per_stop: undefined } as unknown as MissionScenario;
      expect(() => evaTimeline(withoutDwell, waypoints, [15, 15])).toThrow();
    });

    it("keeps a supplied zero-minute return leg", () => {
      const timeline = evaTimeline(scenario, waypoints, [15, 0]);
      expect(timeline).toHaveLength(3);
      expect(timeline[2].arrive_utc).toBe("2026-11-14T08:35:00.000Z");
    });

    it("includes a supplied loop return when the only start is the last waypoint", () => {
      const timeline = evaTimeline(scenario, [waypoints[1], waypoints[0]], [15, 15]);
      expect(timeline).toHaveLength(3);
      expect(timeline[0].arrive_utc).toBe("2026-11-14T08:00:00.000Z");
      expect(timeline[0].depart_utc).toBe("2026-11-14T08:20:00.000Z");
      expect(timeline[2].arrive_utc).toBe("2026-11-14T08:50:00.000Z");
    });
  });
});
