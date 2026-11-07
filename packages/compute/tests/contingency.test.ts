import { describe, expect, it } from "vitest";
import type {
  ContingencyOption,
  Crew,
  CrewId,
  DoseSeries,
  MissionScenario,
  OkLeg,
  ParamSet,
  Waypoint,
} from "@marswalk/protocol";
import {
  proposeOptions,
  type ContingencyInputs,
  type HavenIngress,
  type RendezvousOk,
  type TimeField,
} from "../src";

// docs/specs/02 §D.15 (FR-44, NFR-06). TASK-05b (T05b.18).
//
// Ranked candidate actions: {abort to hab, vehicle rendezvous, continue with remaining stops skipped}.
// Each option carries ETA to shelter, expected dose until sheltered, stops dropped, and violations.
// Ranked by expected dose, then ETA.
//
// When PENDING_RED is not set, the suite is skipped while proposeOptions throws
// "TODO(TASK-05b): not implemented", keeping test-web green during TDD red phase.
const PENDING =
  !process.env.PENDING_RED &&
  ([() => proposeOptions(undefined as never)] as (() => unknown)[]).some((probe) => {
    try {
      probe();
      return false;
    } catch (err) {
      return /TODO\(TASK-05b\): not implemented/.test(String(err));
    }
  });

function makeField(seconds: number): TimeField {
  const width = 400;
  const height = 200;
  const n = width * height;
  const arr = new Float64Array(n);
  arr.fill(seconds);
  const prev = new Int32Array(n);
  prev.fill(-1);
  return {
    cell_m: 5,
    width,
    height,
    origin_m: [0, 500],
    seconds: arr,
    prev,
  };
}

function makeSeries(rateUgyH: number, tUtc = "2026-11-14T08:00:00Z"): DoseSeries {
  return {
    series_id: "test-series",
    quantity: "surface absorbed dose rate",
    unit: "uGy/h",
    background_rate: 10,
    samples: [
      [tUtc, rateUgyH],
      ["2026-11-14T09:00:00Z", rateUgyH],
    ],
    method: "archive",
    provenance: "replayed",
    source_id: "test-source",
    integral_check: { expected_ugy: 0, computed_ugy: 0 },
  };
}

const shieldingParamSet: ParamSet = {
  param_set_id: "shielding-default",
  kind: "shielding",
  title: "Shielding factors",
  values: {
    suit: 1.0,
    pressurized_rover: 0.6,
    hab: 0.4,
  },
  provenance: "assumed",
  source_ids: [],
};

const defaultScenario: MissionScenario = {
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
  vehicle_param_set: "pr1-assumed",
};

const waypoints: Waypoint[] = [
  { id: "wp-0", role: "start", x_m: 0, y_m: 0 },
  { id: "wp-1", role: "stop", x_m: 500, y_m: 0 },
  { id: "wp-2", role: "stop", x_m: 1000, y_m: 0 },
  { id: "wp-3", role: "stop", x_m: 1500, y_m: 0 },
];

const legs: OkLeg[] = [
  {
    from: "wp-0",
    to: "wp-1",
    status: "OK",
    distance_m: 500,
    walk_time_min: 10,
    climb_m: 0,
    descent_m: 0,
    max_slope_deg: 0,
    geometry: [[0, 0], [500, 0]],
    cell_path_length: 100,
    profile: { dist_m: [0, 500], elev_m: [0, 0], slope_class: ["ok", "ok"] },
  },
  {
    from: "wp-1",
    to: "wp-2",
    status: "OK",
    distance_m: 500,
    walk_time_min: 10,
    climb_m: 0,
    descent_m: 0,
    max_slope_deg: 0,
    geometry: [[500, 0], [1000, 0]],
    cell_path_length: 100,
    profile: { dist_m: [500, 1000], elev_m: [0, 0], slope_class: ["ok", "ok"] },
  },
  {
    from: "wp-2",
    to: "wp-3",
    status: "OK",
    distance_m: 500,
    walk_time_min: 10,
    climb_m: 0,
    descent_m: 0,
    max_slope_deg: 0,
    geometry: [[1000, 0], [1500, 0]],
    cell_path_length: 100,
    profile: { dist_m: [1000, 1500], elev_m: [0, 0], slope_class: ["ok", "ok"] },
  },
  {
    from: "wp-3",
    to: "wp-0",
    status: "OK",
    distance_m: 1500,
    walk_time_min: 30,
    climb_m: 0,
    descent_m: 0,
    max_slope_deg: 0,
    geometry: [[1500, 0], [0, 0]],
    cell_path_length: 300,
    profile: { dist_m: [1500, 3000], elev_m: [0, 0], slope_class: ["ok", "ok"] },
  },
];

const ingress: HavenIngress = { hab_s: 300, vehicle_s: 300 };

function createTestInputs(opts: {
  rateUgyH?: number;
  habWalkS?: number;
  rendezvousOk?: RendezvousOk | null;
  stopIndex?: number;
}): ContingencyInputs {
  const crew: Crew[] = [
    {
      crew_id: "EV1" as CrewId,
      x_m: 500,
      y_m: 0,
      activity: "AT_STOP",
      stop_index: opts.stopIndex ?? 1,
      o2_frac: 0.8,
      eva_elapsed_s: 3600,
      dose_event_ugy: 50,
      dose_event_unsheltered_ugy: 50,
      haven: { minutes: 15, kind: "hab", target_x_m: 0, target_y_m: 0 },
      linked: true,
      link_path: ["hab", "EV1"],
      stale: false,
    },
  ];

  return {
    alert_id: "a-001",
    crew,
    now_utc: "2026-11-14T08:00:00Z",
    hab: makeField(opts.habWalkS ?? 600), // 10 min walk to hab
    rendezvous: {
      EV1: opts.rendezvousOk ?? {
        status: "OK",
        x_m: 250,
        y_m: 0,
        eta_crew_s: 300,
        eta_vehicle_s: 200,
        crew_path: [[500, 0], [250, 0]],
        vehicle_path: [[0, 0], [250, 0]],
      },
    },
    ingress,
    plan: { waypoints, legs },
    scenario: defaultScenario,
    series: makeSeries(opts.rateUgyH ?? 3600), // 3600 µGy/h = 1 µGy/s
    shielding: shieldingParamSet,
  };
}

describe.skipIf(PENDING)("proposeOptions", () => {
  it("ranks by expected dose, then ETA", () => {
    // 3 candidates: ABORT_TO_HAB, VEHICLE_RENDEZVOUS, CONTINUE_SKIP.
    // Vehicle rendezvous has smaller ETA (300 s walk + 300 s ingress = 600 s) than hab (600 s walk + 300 s = 900 s),
    // and smaller ETA than continue-skip (remaining legs: 10 + 10 + 30 min = 50 min = 3000 s + 300 s = 3300 s).
    // In constant dose rate, lower ETA produces lower dose, ranking VEHICLE_RENDEZVOUS #1, ABORT_TO_HAB #2, CONTINUE_SKIP #3.
    const inputs = createTestInputs({});
    const options = proposeOptions(inputs);

    expect(options.length).toBe(3);
    expect(options[0].kind).toBe("VEHICLE_RENDEZVOUS");
    expect(options[0].rank).toBe(1);
    expect(options[1].kind).toBe("ABORT_TO_HAB");
    expect(options[1].rank).toBe(2);
    expect(options[2].kind).toBe("CONTINUE_SKIP");
    expect(options[2].rank).toBe(3);

    // Verify ranks are 1..N and strictly ascending by expected_dose_ugy, then eta_shelter_min
    for (let i = 1; i < options.length; i++) {
      const prev = options[i - 1];
      const curr = options[i];
      const doseDiff = curr.expected_dose_ugy - prev.expected_dose_ugy;
      if (doseDiff === 0) {
        expect(curr.eta_shelter_min).toBeGreaterThanOrEqual(prev.eta_shelter_min);
      } else {
        expect(doseDiff).toBeGreaterThan(0);
      }
      expect(curr.rank).toBe(i + 1);
    }

    // When dose is identical (rate = 0), ETA strictly breaks the tie (VEHICLE 10m < HAB 15m < CONTINUE 55m)
    const zeroDoseInputs = createTestInputs({ rateUgyH: 0 });
    const zeroDoseOptions = proposeOptions(zeroDoseInputs);
    expect(zeroDoseOptions[0].kind).toBe("VEHICLE_RENDEZVOUS");
    expect(zeroDoseOptions[1].kind).toBe("ABORT_TO_HAB");
    expect(zeroDoseOptions[2].kind).toBe("CONTINUE_SKIP");
  });

  it("vehicle rendezvous absent when NO_RENDEZVOUS", () => {
    const inputs = createTestInputs({});
    inputs.rendezvous = { EV1: { status: "NO_RENDEZVOUS" } };

    const options = proposeOptions(inputs);
    expect(options.length).toBe(2);
    expect(options.some((o) => o.kind === "VEHICLE_RENDEZVOUS")).toBe(false);
    expect(options.map((o) => o.kind)).toEqual(["ABORT_TO_HAB", "CONTINUE_SKIP"]);
  });

  it("continue-with-skips lists the dropped stop indices", () => {
    // Crew at stop 1 (wp-1) in a plan with 3 stops (wp-1, wp-2, wp-3).
    // All subsequent stops (2 and 3) must be dropped.
    const inputs = createTestInputs({ stopIndex: 1 });
    const options = proposeOptions(inputs);

    const skipOption = options.find((o) => o.kind === "CONTINUE_SKIP");
    expect(skipOption).toBeDefined();
    expect(skipOption!.stops_dropped).toEqual([2, 3]);

    const abortOption = options.find((o) => o.kind === "ABORT_TO_HAB");
    expect(abortOption!.stops_dropped).toEqual([2, 3]);
  });

  it("is deterministic for identical inputs", () => {
    const inputs1 = createTestInputs({});
    const inputs2 = createTestInputs({});

    const options1 = proposeOptions(inputs1);
    const options2 = proposeOptions(inputs2);

    expect(options1).toEqual(options2);
  });

  it("flags constraint violations when haven time exceeded", () => {
    // Scenario with max_haven_min: 10 min (600 s)
    // Hab walk is 900 s + ingress 300 s = 1200 s = 20 min > 10 min -> HAVEN_TIME_EXCEEDED
    const scenario = { ...defaultScenario, max_haven_min: 10 };
    const inputs = createTestInputs({ habWalkS: 900 });
    inputs.scenario = scenario;

    const options = proposeOptions(inputs);
    const abortOption = options.find((o) => o.kind === "ABORT_TO_HAB")!;
    expect(abortOption.violations).toContain("HAVEN_TIME_EXCEEDED");
  });

  it("two-crew pair uses first-visited meeting point and later arrival", () => {
    const r0: RendezvousOk = {
      status: "OK",
      x_m: 200,
      y_m: 0,
      eta_crew_s: 250,
      eta_vehicle_s: 200,
      crew_path: [[100, 0], [200, 0]],
      vehicle_path: [[0, 0], [200, 0]],
    };
    const r1: RendezvousOk = {
      status: "OK",
      x_m: 400,
      y_m: 0,
      eta_crew_s: 300,
      eta_vehicle_s: 500,
      crew_path: [[300, 0], [400, 0]],
      vehicle_path: [[0, 0], [400, 0]],
    };

    const crew: Crew[] = [
      {
        crew_id: "EV1" as CrewId,
        x_m: 100,
        y_m: 0,
        activity: "AT_STOP",
        stop_index: 1,
        o2_frac: 0.8,
        eva_elapsed_s: 3600,
        dose_event_ugy: 0,
        dose_event_unsheltered_ugy: 0,
        haven: { minutes: 10, kind: "vehicle", target_x_m: 200, target_y_m: 0 },
        linked: true,
        link_path: [],
        stale: false,
      },
      {
        crew_id: "EV2" as CrewId,
        x_m: 300,
        y_m: 0,
        activity: "AT_STOP",
        stop_index: 1,
        o2_frac: 0.8,
        eva_elapsed_s: 3600,
        dose_event_ugy: 0,
        dose_event_unsheltered_ugy: 0,
        haven: { minutes: 10, kind: "vehicle", target_x_m: 400, target_y_m: 0 },
        linked: true,
        link_path: [],
        stale: false,
      },
    ];

    const inputs: ContingencyInputs = {
      alert_id: "a-pair",
      crew,
      now_utc: "2026-11-14T08:00:00Z",
      hab: makeField(1200),
      rendezvous: { EV1: r0, EV2: r1 },
      ingress,
      pair: {
        order: [0, 1], // Visit EV1 first, then EV2
        later_arrival_s: 450,
      },
      plan: { waypoints, legs },
      scenario: defaultScenario,
      series: makeSeries(1800),
      shielding: shieldingParamSet,
    };

    const options = proposeOptions(inputs);
    const vehOption = options.find((o) => o.kind === "VEHICLE_RENDEZVOUS")!;
    expect(vehOption).toBeDefined();

    // First visited point (EV1) is reported in rendezvous
    expect(vehOption.rendezvous).toEqual({
      x_m: r0.x_m,
      y_m: r0.y_m,
      eta_crew_s: r0.eta_crew_s,
      eta_vehicle_s: r0.eta_vehicle_s,
    });
    // Shelter ETA uses pair.later_arrival_s + vehicle ingress (450 + 300 = 750 s = 12.5 min)
    expect(vehOption.eta_shelter_min).toBe(750 / 60);
  });
});
