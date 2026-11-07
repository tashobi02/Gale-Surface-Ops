import { describe, expect, it } from "vitest";
import type {
  ContingencyOption,
  Crew,
  CrewId,
  DoseSeries,
  Leg,
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
  type RendezvousPair,
  type TimeField,
} from "../src";

// docs/specs/02 §D.15 (FR-44, NFR-06). TASK-05b (T05b.18).
//
// Ranked candidate actions: {abort to hab, vehicle rendezvous, continue with remaining stops skipped}.
// Each option carries ETA to shelter, expected dose until sheltered, stops dropped and violations.
// Ranked by expected dose, then ETA; ties are broken by option_id (Proposed in TASK-05b, T05b.19).
//
// Every expected value below is derived in the test from the fixtures (closed forms), never typed in.
// The shielding factors, ingress seconds, dose rates and rendezvous seconds are TEST-ONLY stub values.
//
// Why no "lower dose, higher ETA" case: every option starts at now_utc and the replayed rate is never
// negative, so the dose until sheltered cannot decrease as the ETA grows. Dose-first and ETA-first
// ranking therefore only differ in how equal doses are ordered. The piecewise-rate test below covers
// that: options past the end of the burst share one dose and are ordered by ETA.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CELL_M = 5;
const WIDTH = 400;
const HEIGHT = 200;
const ORIGIN_M: [number, number] = [0, 500];

/** Centre of the 5 m cell that contains (x, y): an independent copy of the grid rule (north-up rows). */
function cellCentre(x: number, y: number): [number, number] {
  const col = Math.floor((x - ORIGIN_M[0]) / CELL_M);
  const row = Math.floor((ORIGIN_M[1] - y) / CELL_M);
  return [ORIGIN_M[0] + (col + 0.5) * CELL_M, ORIGIN_M[1] - (row + 0.5) * CELL_M];
}

/**
 * Test-only walk time to the hab, seconds, as a function of the cell centre. Asymmetric in x and y and
 * different in every cell, so a wrong crew coordinate (or a swapped x and y) changes the result.
 */
function habWalkS(x: number, y: number): number {
  const [cx, cy] = cellCentre(x, y);
  return 100 + 0.6 * cx + 0.2 * (500 - cy);
}

function makeHabField(): TimeField {
  const seconds = new Float64Array(WIDTH * HEIGHT);
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      const cx = ORIGIN_M[0] + (col + 0.5) * CELL_M;
      const cy = ORIGIN_M[1] - (row + 0.5) * CELL_M;
      seconds[row * WIDTH + col] = habWalkS(cx, cy);
    }
  }
  return { cell_m: CELL_M, width: WIDTH, height: HEIGHT, origin_m: [...ORIGIN_M], seconds, prev: new Int32Array(WIDTH * HEIGHT).fill(-1) };
}

const T0 = "2026-11-14T08:00:00Z";
const T0_MS = Date.parse(T0);

function isoAt(offsetS: number): string {
  return new Date(T0_MS + offsetS * 1000).toISOString();
}

function makeSeries(samples: [string, number | null][]): DoseSeries {
  return {
    series_id: "test-series",
    quantity: "surface absorbed dose rate",
    unit: "uGy/h",
    background_rate: 10,
    samples,
    method: "archive",
    provenance: "replayed",
    source_id: "test-source",
    integral_check: { expected_ugy: 0, computed_ugy: 0 },
  };
}

function constantSeries(rateUgyH: number): DoseSeries {
  return makeSeries([[T0, rateUgyH], [isoAt(3600), rateUgyH]]);
}

/** Test-only factors; the suit factor is not 1, so using another factor or none changes the dose. */
const SUIT = 0.8;
const shieldingParamSet: ParamSet = {
  param_set_id: "shielding-default",
  kind: "shielding",
  title: "Shielding factors",
  values: { suit: SUIT, pressurized_rover: 0.6, hab: 0.4 },
  provenance: "assumed",
  source_ids: [],
};

const defaultScenario: MissionScenario = {
  eva_start_utc: T0,
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

function okLeg(from: string, to: string, walkMin: number, geometry: [number, number][]): OkLeg {
  return {
    from,
    to,
    status: "OK",
    distance_m: Math.abs(geometry[geometry.length - 1][0] - geometry[0][0]),
    walk_time_min: walkMin,
    climb_m: 0,
    descent_m: 0,
    max_slope_deg: 0,
    geometry,
    cell_path_length: 100,
    profile: { dist_m: [0, 1], elev_m: [0, 0], slope_class: ["ok", "ok"] },
  };
}

function makeLegs(): OkLeg[] {
  return [
    okLeg("wp-0", "wp-1", 10, [[0, 0], [500, 0]]),
    okLeg("wp-1", "wp-2", 10, [[500, 0], [1000, 0]]),
    okLeg("wp-2", "wp-3", 10, [[1000, 0], [1500, 0]]),
    okLeg("wp-3", "wp-0", 30, [[1500, 0], [0, 0]]),
  ];
}

const legs = makeLegs();

/** Test-only ingress seconds; different, so that using one for the other changes an ETA. */
const ingress: HavenIngress = { hab_s: 300, vehicle_s: 240 };

function makeCrew(id: CrewId, x_m: number, y_m: number, stopIndex: number, evaElapsedS = 3600): Crew {
  return {
    crew_id: id,
    x_m,
    y_m,
    activity: "AT_STOP",
    stop_index: stopIndex,
    o2_frac: 0.8,
    eva_elapsed_s: evaElapsedS,
    dose_event_ugy: 0,
    dose_event_unsheltered_ugy: 0,
    haven: { minutes: 15, kind: "hab", target_x_m: 0, target_y_m: 0 },
    linked: true,
    link_path: ["hab", id],
    stale: false,
  };
}

/** Test-only rendezvous seconds. */
function makeRendezvous(x_m: number, y_m: number, etaCrewS: number, etaVehicleS: number, from: [number, number]): RendezvousOk {
  return {
    status: "OK",
    x_m,
    y_m,
    eta_crew_s: etaCrewS,
    eta_vehicle_s: etaVehicleS,
    crew_path: [from, [x_m, y_m]],
    vehicle_path: [[0, 0], [x_m, y_m]],
  };
}

function baseInputs(overrides: Partial<ContingencyInputs> = {}): ContingencyInputs {
  return {
    alert_id: "a-001",
    crew: [makeCrew("EV1", 500, 0, 1)],
    now_utc: T0,
    hab: makeHabField(),
    rendezvous: { EV1: makeRendezvous(250, 0, 300, 200, [500, 0]) },
    ingress,
    plan: { waypoints, legs: makeLegs() },
    scenario: defaultScenario,
    series: constantSeries(1800), // 0.5 uGy/s
    shielding: shieldingParamSet,
    ...overrides,
  };
}

function byKind(options: ContingencyOption[], kind: ContingencyOption["kind"]): ContingencyOption {
  const found = options.find((o) => o.kind === kind);
  if (!found) throw new Error(`no ${kind} option in ${options.map((o) => o.kind).join(", ")}`);
  return found;
}

function expectClose(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 9);
}

/** Closed form of a constant rate in a suit: rate (uGy/h) x suit factor x seconds / 3600. */
function constantDose(rateUgyH: number, etaS: number): number {
  return (rateUgyH * SUIT * etaS) / 3600;
}

function allNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allNumbers(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => allNumbers(v, out));
  return out;
}

/** JSON view of the inputs that includes the first cells of the typed arrays. */
function snapshot(inputs: ContingencyInputs): string {
  return JSON.stringify(inputs, (_k, v) => (v instanceof Float64Array || v instanceof Int32Array ? Array.from(v.subarray(0, 8)) : v));
}

// Derived oracle values for the default inputs (crew EV1 at the first stop, wp-1).
const EV1_HAB_ETA_S = habWalkS(500, 0) + ingress.hab_s;
const VEHICLE_ETA_S = Math.max(300, 200) + ingress.vehicle_s;
const REMAINING_WALK_MIN = legs[1].walk_time_min + legs[2].walk_time_min + legs[3].walk_time_min;
const SKIP_ETA_S = REMAINING_WALK_MIN * 60 + ingress.hab_s;

// ---------------------------------------------------------------------------

describe("proposeOptions", () => {
  it("ranks by expected dose, then ETA", () => {
    const options = proposeOptions(baseInputs());

    // Derived ETAs order the options: vehicle < hab < continue-with-skips.
    expect(VEHICLE_ETA_S).toBeLessThan(EV1_HAB_ETA_S);
    expect(EV1_HAB_ETA_S).toBeLessThan(SKIP_ETA_S);
    expect(options.map((o) => o.kind)).toEqual(["VEHICLE_RENDEZVOUS", "ABORT_TO_HAB", "CONTINUE_SKIP"]);
    expect(options.map((o) => o.rank)).toEqual([1, 2, 3]);
    for (let i = 1; i < options.length; i++) {
      expect(options[i].expected_dose_ugy).toBeGreaterThan(options[i - 1].expected_dose_ugy);
    }

    // With no dose at all the ETA alone orders them.
    const zero = proposeOptions(baseInputs({ series: constantSeries(0) }));
    expect(zero.map((o) => o.expected_dose_ugy)).toEqual([0, 0, 0]);
    expect(zero.map((o) => o.kind)).toEqual(["VEHICLE_RENDEZVOUS", "ABORT_TO_HAB", "CONTINUE_SKIP"]);
  });

  it("step 2: each option carries its ETA, closed-form dose, stops dropped and violations", () => {
    const rate = 1800;
    // A generous haven limit, so that no option carries a violation here (violations have their own tests).
    const scenario = { ...defaultScenario, max_haven_min: 600 };
    const inputs = baseInputs({ series: constantSeries(rate), scenario });
    const options = proposeOptions(inputs);
    expect(options).toHaveLength(3);

    const expected: Record<string, number> = {
      ABORT_TO_HAB: EV1_HAB_ETA_S,
      VEHICLE_RENDEZVOUS: VEHICLE_ETA_S,
      CONTINUE_SKIP: SKIP_ETA_S,
    };
    for (const o of options) {
      expectClose(o.eta_shelter_min, expected[o.kind] / 60);
      expectClose(o.expected_dose_ugy, constantDose(rate, expected[o.kind]));
      expect(o.expected_dose_ugy).toBeGreaterThan(0);
      expect(o.stops_dropped).toEqual([2, 3]);
      expect(o.violations).toEqual([]);
      expect(o.crew_ids).toEqual(["EV1"]);
      expect(o.alert_id).toBe("a-001");
      expect(o.option_id).toBe(`a-001:${o.kind}`);
    }
    expect(byKind(options, "VEHICLE_RENDEZVOUS").rendezvous).toEqual({ x_m: 250, y_m: 0, eta_crew_s: 300, eta_vehicle_s: 200 });
    expect(byKind(options, "ABORT_TO_HAB").rendezvous).toBeNull();
    expect(byKind(options, "CONTINUE_SKIP").rendezvous).toBeNull();
    // 05 ContingencyOption is a wire type: it survives JSON unchanged.
    expect(JSON.parse(JSON.stringify(options))).toEqual(options);
  });

  it("projects the dose over the replayed rate, splitting at the sample times", () => {
    // 2 uGy/s until a burst ends at 700 s (not a multiple of any step), then 0.
    const burstEndS = 700;
    const rate = 7200;
    const series = makeSeries([[T0, rate], [isoAt(burstEndS), 0], [isoAt(3600), 0]]);
    const options = proposeOptions(baseInputs({ series }));
    const etaS: Record<string, number> = { ABORT_TO_HAB: EV1_HAB_ETA_S, VEHICLE_RENDEZVOUS: VEHICLE_ETA_S, CONTINUE_SKIP: SKIP_ETA_S };
    // The vehicle is sheltered before the burst ends; the others receive the whole burst.
    expect(VEHICLE_ETA_S).toBeLessThan(burstEndS);
    expect(EV1_HAB_ETA_S).toBeGreaterThan(burstEndS);
    for (const o of options) {
      expectClose(o.expected_dose_ugy, constantDose(rate, Math.min(etaS[o.kind], burstEndS)));
    }
    // Hab and skip share one dose, so ETA orders them; the vehicle has the lower dose.
    expect(options.map((o) => o.kind)).toEqual(["VEHICLE_RENDEZVOUS", "ABORT_TO_HAB", "CONTINUE_SKIP"]);
    expectClose(options[1].expected_dose_ugy, options[2].expected_dose_ugy);
    expect(options[0].expected_dose_ugy).toBeLessThan(options[1].expected_dose_ugy);
  });

  it("starts the projection at now_utc, not at the series start", () => {
    // Rate 0 for the first 100 s, then 3600 uGy/h: a projection from T0 + 100 s sees only the high rate.
    const series = makeSeries([[T0, 0], [isoAt(100), 3600], [isoAt(3600), 3600]]);
    const options = proposeOptions(baseInputs({ series, now_utc: isoAt(100) }));
    for (const o of options) expect(o.expected_dose_ugy).toBeGreaterThan(0);
    expectClose(byKind(options, "VEHICLE_RENDEZVOUS").expected_dose_ugy, constantDose(3600, VEHICLE_ETA_S));
  });

  it("vehicle rendezvous absent when NO_RENDEZVOUS", () => {
    const options = proposeOptions(baseInputs({ rendezvous: { EV1: { status: "NO_RENDEZVOUS" } } }));
    expect(options.map((o) => o.kind)).toEqual(["ABORT_TO_HAB", "CONTINUE_SKIP"]);
  });

  it("vehicle rendezvous absent when the crew member has no rendezvous entry", () => {
    const options = proposeOptions(baseInputs({ rendezvous: {} }));
    expect(options.some((o) => o.kind === "VEHICLE_RENDEZVOUS")).toBe(false);
  });

  it("continue-with-skips lists the dropped stop indices", () => {
    // Three stops (wp-1, wp-2, wp-3). Crew at stop 1: stops 2 and 3 are dropped; at stop 3: none.
    for (const [stopIndex, dropped] of [[1, [2, 3]], [2, [3]], [3, []]] as [number, number[]][]) {
      const options = proposeOptions(baseInputs({ crew: [makeCrew("EV1", 500, 0, stopIndex)] }));
      for (const o of options) expect(o.stops_dropped).toEqual(dropped);
    }
  });

  it("continue-with-skips walks the rest of the plan from the crew position, not from the last stop", () => {
    // Halfway along wp-1 -> wp-2 (500 -> 1000 m): half of that leg is left, then the later legs whole.
    const crew = [makeCrew("EV1", 750, 0, 1)];
    const options = proposeOptions(baseInputs({ crew }));
    const skip = byKind(options, "CONTINUE_SKIP");
    const leftMin = 0.5 * legs[1].walk_time_min + legs[2].walk_time_min + legs[3].walk_time_min;
    expectClose(skip.eta_shelter_min, (leftMin * 60 + ingress.hab_s) / 60);
    // The preview starts where the crew is and follows the planned geometry to the end.
    expect(skip.path_preview).toEqual([[750, 0], [1000, 0], [1500, 0], [0, 0]]);
  });

  it("drops continue-with-skips when a remaining leg has no route", () => {
    const broken: Leg = { from: "wp-2", to: "wp-3", status: "NO_ROUTE", reason: "DISCONNECTED_BY_SLOPE" };
    const plan = { waypoints, legs: [legs[0], legs[1], broken, legs[3]] };
    const options = proposeOptions(baseInputs({ plan }));
    expect(options.map((o) => o.kind).sort()).toEqual(["ABORT_TO_HAB", "VEHICLE_RENDEZVOUS"]);
  });

  it("is deterministic for identical inputs and leaves the inputs unchanged", () => {
    const a = baseInputs();
    const before = snapshot(a);
    const first = proposeOptions(a);
    expect(snapshot(a)).toBe(before);
    expect(first).toEqual(proposeOptions(baseInputs()));
    expect(first).toEqual(proposeOptions(a));
  });

  it("options do not share arrays with each other or with the inputs", () => {
    const inputs = baseInputs();
    const options = proposeOptions(inputs);
    const lists = options.flatMap((o) => [o.stops_dropped, o.path_preview]);
    expect(new Set(lists).size).toBe(lists.length);
    const vehicle = byKind(options, "VEHICLE_RENDEZVOUS");
    const crewPath = (inputs.rendezvous.EV1 as RendezvousOk).crew_path;
    expect(vehicle.path_preview).toEqual(crewPath);
    expect(vehicle.path_preview).not.toBe(crewPath);
    expect(vehicle.path_preview[0]).not.toBe(crewPath[0]);
    // Changing one option leaves the others and the inputs alone.
    const expected = JSON.stringify(proposeOptions(baseInputs()));
    byKind(options, "ABORT_TO_HAB").stops_dropped.push(99);
    byKind(options, "ABORT_TO_HAB").path_preview.push([1, 1]);
    vehicle.path_preview[0][0] = -1;
    expect(JSON.stringify(proposeOptions(inputs))).toBe(expected);
    expect(byKind(options, "CONTINUE_SKIP").stops_dropped).toEqual([2, 3]);
  });

  it("ties on dose and ETA are ordered by option_id (code-point order), not by input order", () => {
    // Crew at the last stop (wp-3): skip = last leg 30 min + hab ingress; vehicle = the same seconds. Both
    // options have the same ETA, hence the same dose. Candidates are built hab, vehicle, skip, so a sort
    // with no third key would leave VEHICLE_RENDEZVOUS first; "CONTINUE_SKIP" < "VEHICLE_RENDEZVOUS".
    const lastLegS = legs[3].walk_time_min * 60;
    const crew = [makeCrew("EV1", 1500, 0, 3)];
    const inputs = baseInputs({
      crew,
      rendezvous: { EV1: makeRendezvous(900, 0, lastLegS, 1000, [1500, 0]) },
      ingress: { hab_s: 300, vehicle_s: 300 },
    });
    const options = proposeOptions(inputs);
    const skip = byKind(options, "CONTINUE_SKIP");
    const vehicle = byKind(options, "VEHICLE_RENDEZVOUS");
    const abort = byKind(options, "ABORT_TO_HAB");
    expect(skip.eta_shelter_min).toBe(vehicle.eta_shelter_min);
    expect(skip.expected_dose_ugy).toBe(vehicle.expected_dose_ugy);
    expect(abort.eta_shelter_min).toBeLessThan(skip.eta_shelter_min);
    expect(options.map((o) => o.kind)).toEqual(["ABORT_TO_HAB", "CONTINUE_SKIP", "VEHICLE_RENDEZVOUS"]);
    expect(options.map((o) => o.rank)).toEqual([1, 2, 3]);
  });

  it("lists as dropped the stops after the stop furthest along (Proposed: max stop_index of the crew)", () => {
    const crew = [makeCrew("EV1", 1000, 0, 2), makeCrew("EV2", 500, 0, 1)];
    const options = proposeOptions(baseInputs({ crew, rendezvous: {} }));
    for (const o of options) expect(o.stops_dropped).toEqual([3]);
  });

  it("flags HAVEN_TIME_EXCEEDED only when the ETA is strictly over max_haven_min", () => {
    const vehicleMin = VEHICLE_ETA_S / 60;
    const scenario = { ...defaultScenario, max_haven_min: vehicleMin };
    const options = proposeOptions(baseInputs({ scenario }));
    for (const o of options) {
      const over = o.eta_shelter_min > scenario.max_haven_min;
      expect(o.violations.includes("HAVEN_TIME_EXCEEDED")).toBe(over);
    }
    expect(byKind(options, "VEHICLE_RENDEZVOUS").violations).toEqual([]);
    expect(byKind(options, "ABORT_TO_HAB").violations).toContain("HAVEN_TIME_EXCEEDED");
  });

  it("flags EVA_DURATION_EXCEEDED when elapsed time plus ETA passes max_eva_duration_h", () => {
    const limitS = defaultScenario.max_eva_duration_h * 3600;
    // Elapsed is set so that the vehicle ETA fits and the hab and skip ETAs do not.
    const elapsed = limitS - (VEHICLE_ETA_S + 50);
    expect(elapsed + EV1_HAB_ETA_S).toBeGreaterThan(limitS);
    const options = proposeOptions(baseInputs({ crew: [makeCrew("EV1", 500, 0, 1, elapsed)] }));
    for (const o of options) {
      expect(o.violations.includes("EVA_DURATION_EXCEEDED")).toBe(elapsed + o.eta_shelter_min * 60 > limitS);
    }
    expect(byKind(options, "VEHICLE_RENDEZVOUS").violations).toEqual([]);
    expect(byKind(options, "ABORT_TO_HAB").violations).toEqual(["EVA_DURATION_EXCEEDED"]);
  });

  it("returns no options for an empty crew", () => {
    expect(proposeOptions(baseInputs({ crew: [] }))).toEqual([]);
  });

  it("rejects an invalid now_utc", () => {
    expect(() => proposeOptions(baseInputs({ now_utc: "not a time" }))).toThrow(RangeError);
  });

  describe("unreachable crew (no non-finite numbers on the wire)", () => {
    it("an off-grid crew member gets no abort option and every number is finite", () => {
      const crew = [makeCrew("EV1", -1000, 0, 1)];
      const options = proposeOptions(baseInputs({ crew, rendezvous: { EV1: { status: "NO_RENDEZVOUS" } } }));
      expect(options.some((o) => o.kind === "ABORT_TO_HAB")).toBe(false);
      for (const n of allNumbers(options)) expect(Number.isFinite(n)).toBe(true);
      expect(JSON.parse(JSON.stringify(options))).toEqual(options);
    });

    it("a crew member in an unreachable cell gets no abort option", () => {
      const hab = makeHabField();
      const [cx, cy] = cellCentre(500, 0);
      const k = Math.floor((ORIGIN_M[1] - cy) / CELL_M) * WIDTH + Math.floor((cx - ORIGIN_M[0]) / CELL_M);
      hab.seconds[k] = Infinity;
      const options = proposeOptions(baseInputs({ hab }));
      expect(options.map((o) => o.kind).sort()).toEqual(["CONTINUE_SKIP", "VEHICLE_RENDEZVOUS"]);
      for (const n of allNumbers(options)) expect(Number.isFinite(n)).toBe(true);
    });

    it("a non-finite rendezvous time drops the vehicle option", () => {
      const bad = makeRendezvous(250, 0, Infinity, 200, [500, 0]);
      const options = proposeOptions(baseInputs({ rendezvous: { EV1: bad } }));
      expect(options.some((o) => o.kind === "VEHICLE_RENDEZVOUS")).toBe(false);
      for (const n of allNumbers(options)) expect(Number.isFinite(n)).toBe(true);
    });

    it("a non-finite number inside the chosen meeting point drops the vehicle option (pair)", () => {
      // The pair's later arrival is finite, but the first-visited point carries an infinite time.
      const first = makeRendezvous(200, 0, 250, Infinity, [100, 0]);
      const second = makeRendezvous(400, 0, 300, 500, [300, 0]);
      const inputs = baseInputs({
        crew: [makeCrew("EV1", 100, 0, 1), makeCrew("EV2", 300, 0, 1)],
        rendezvous: { EV1: first, EV2: second },
        pair: { order: [0, 1], later_arrival_s: 450 },
      });
      const options = proposeOptions(inputs);
      expect(options.some((o) => o.kind === "VEHICLE_RENDEZVOUS")).toBe(false);
      for (const n of allNumbers(options)) expect(Number.isFinite(n)).toBe(true);
    });

    it("returns [] when no option can be given a finite ETA", () => {
      const crew = [makeCrew("EV1", -1000, 0, 1)];
      const broken: Leg = { from: "wp-1", to: "wp-2", status: "NO_ROUTE", reason: "DISCONNECTED_BY_HAZARD" };
      const plan = { waypoints, legs: [legs[0], broken, legs[2], legs[3]] };
      const options = proposeOptions(baseInputs({ crew, plan, rendezvous: { EV1: { status: "NO_RENDEZVOUS" } } }));
      expect(options).toEqual([]);
    });
  });

  describe("two crew", () => {
    const r0 = makeRendezvous(200, 0, 250, 200, [100, 0]);
    const r1 = makeRendezvous(400, 0, 300, 500, [300, 0]);
    const pair01: RendezvousPair = { order: [0, 1], later_arrival_s: 450 };
    const pair10: RendezvousPair = { order: [1, 0], later_arrival_s: 600 };

    function pairInputs(pair: RendezvousPair | undefined, evaElapsed: [number, number] = [3600, 3600]): ContingencyInputs {
      return baseInputs({
        alert_id: "a-pair",
        crew: [makeCrew("EV1", 100, 0, 1, evaElapsed[0]), makeCrew("EV2", 300, 0, 1, evaElapsed[1])],
        rendezvous: { EV1: r0, EV2: r1 },
        pair,
        series: constantSeries(1800),
      });
    }

    it("uses the first-visited meeting point and the later arrival", () => {
      for (const [pair, first] of [[pair01, r0], [pair10, r1]] as [RendezvousPair, RendezvousOk][]) {
        const options = proposeOptions(pairInputs(pair));
        const vehicle = byKind(options, "VEHICLE_RENDEZVOUS");
        const etaS = pair.later_arrival_s + ingress.vehicle_s;
        expect(vehicle.rendezvous).toEqual({ x_m: first.x_m, y_m: first.y_m, eta_crew_s: first.eta_crew_s, eta_vehicle_s: first.eta_vehicle_s });
        expect(vehicle.path_preview).toEqual(first.crew_path);
        expectClose(vehicle.eta_shelter_min, etaS / 60);
        expectClose(vehicle.expected_dose_ugy, constantDose(1800, etaS));
        expect(vehicle.crew_ids).toEqual(["EV1", "EV2"]);
      }
    });

    it("throws RangeError when two crew have rendezvous results but no pair", () => {
      // EV1 meets at 100 s and EV2 at 2000 s: crew[0]'s numbers alone would hide EV2's wait.
      const slow = makeRendezvous(400, 0, 2000, 500, [300, 0]);
      const fast = makeRendezvous(200, 0, 100, 50, [100, 0]);
      const inputs = pairInputs(undefined);
      inputs.rendezvous = { EV1: fast, EV2: slow };
      expect(() => proposeOptions(inputs)).toThrow(RangeError);
    });

    it("needs no pair when a crew member has no rendezvous (the pair cannot be built)", () => {
      const inputs = pairInputs(undefined);
      inputs.rendezvous = { EV1: r0, EV2: { status: "NO_RENDEZVOUS" } };
      const options = proposeOptions(inputs);
      expect(options.map((o) => o.kind).sort()).toEqual(["ABORT_TO_HAB", "CONTINUE_SKIP"]);
    });

    it("abort waits for the slower of the two, using each crew member's own coordinates", () => {
      const near = { x: 100, y: 0 };
      const far = { x: 900, y: 200 };
      expect(habWalkS(far.x, far.y)).toBeGreaterThan(habWalkS(near.x, near.y));
      // The far member is crew[1] in one run and crew[0] in the other: the max is the same.
      for (const [a, b] of [[near, far], [far, near]]) {
        const inputs = baseInputs({
          crew: [makeCrew("EV1", a.x, a.y, 1), makeCrew("EV2", b.x, b.y, 1)],
          rendezvous: {},
        });
        const options = proposeOptions(inputs);
        const abort = byKind(options, "ABORT_TO_HAB");
        const expectedS = Math.max(habWalkS(a.x, a.y), habWalkS(b.x, b.y)) + ingress.hab_s;
        expectClose(abort.eta_shelter_min, expectedS / 60);
        expectClose(abort.expected_dose_ugy, constantDose(1800, expectedS));
        // The preview is the walk of crew[0].
        expect(abort.path_preview).toEqual([cellCentre(a.x, a.y)]);
      }
    });

    it("continue-with-skips waits for the member with the longer way left", () => {
      // EV1 near the end of the plan, EV2 at the first stop: the ETA is EV2's.
      const inputs = baseInputs({
        crew: [makeCrew("EV1", 1500, 0, 3), makeCrew("EV2", 500, 0, 1)],
        rendezvous: {},
      });
      const skip = byKind(proposeOptions(inputs), "CONTINUE_SKIP");
      expectClose(skip.eta_shelter_min, (REMAINING_WALK_MIN * 60 + ingress.hab_s) / 60);
    });

    it("EVA_DURATION_EXCEEDED uses the crew member who has been out longest", () => {
      const limitS = defaultScenario.max_eva_duration_h * 3600;
      const longest = limitS - 100;
      const options = proposeOptions(pairInputs(pair01, [3600, longest]));
      for (const o of options) expect(o.violations).toContain("EVA_DURATION_EXCEEDED");
      const shortOnly = proposeOptions(pairInputs(pair01, [3600, 3600]));
      for (const o of shortOnly) expect(o.violations).not.toContain("EVA_DURATION_EXCEEDED");
    });
  });
});
