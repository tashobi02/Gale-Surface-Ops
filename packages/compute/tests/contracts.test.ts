import { describe, expect, expectTypeOf, it } from "vitest";
import type { Crew, CrewId, DoseSeries, Leg, MissionScenario, ParamSet, Waypoint } from "@marswalk/protocol";
import * as compute from "../src";
import type {
  ContingencyInputs,
  EventDose,
  HavenIngress,
  LiveHaven,
  LoadedGrid,
  RendezvousOk,
  RendezvousResult,
  TimeField,
} from "../src";

// Contract C15 (docs/tasks/_coordination.md): the frozen signatures of the v2 compute modules
// (docs/specs/02 §D.8–§D.15). T05b.01. Types and names only: nothing here calls a stub, because
// every stub throws `TODO(TASK-05b): not implemented` until its own subtask replaces it.
// `expectTypeOf` is checked by `tsc` (make typecheck); the runtime half checks the names exist.

type XY = { x_m: number; y_m: number };

const FROZEN_FUNCTIONS = [
  // 02 §D.8
  "habTimeField",
  "vehicleTimeField",
  "crewTimeField",
  "havenAlongRoute",
  "vehiclePassable",
  "timeAt",
  "pathTo",
  "liveHaven",
  // 02 §D.10
  "rendezvous",
  "rendezvousPair",
  // 02 §D.11
  "horizonDistanceM",
  "lineOfSight",
  "viewshed",
  // 02 §D.11 link graph, §D.12 Earth link
  "linkStates",
  "linkAt",
  "nextPassStart",
  "inConjunction",
  "deliveryTime",
  // 02 §D.13, §D.14
  "rateAt",
  "triggerState",
  "integrateDose",
  "stepO2",
  "o2RemainingS",
  // 02 §D.15
  "proposeOptions",
] as const;

describe("C15 exported names", () => {
  it.each(FROZEN_FUNCTIONS)("%s is exported as a function", (name) => {
    expect(typeof (compute as Record<string, unknown>)[name]).toBe("function");
  });
});

describe("C15 named constants carry their cited spec numbers", () => {
  it("HAB_INGRESS_S is 5 min (02 §D.8 t_ingress, Assumed)", () => {
    expect(compute.HAB_INGRESS_S).toBe(5 * 60);
  });
  it("VEHICLE_GRID_CELL_M is 10 m (02 §D.8)", () => {
    expect(compute.VEHICLE_GRID_CELL_M).toBe(10);
  });
  it("HAVEN_SAMPLE_SPACING_M is 50 m (02 §D.8)", () => {
    expect(compute.HAVEN_SAMPLE_SPACING_M).toBe(50);
  });
  it("HAVEN_PLANNING_RADIUS_M is 300 m (02 §D.8)", () => {
    expect(compute.HAVEN_PLANNING_RADIUS_M).toBe(300);
  });
});

describe("C15 haven signatures (02 §D.8)", () => {
  it("TimeField carries its origin and back-pointers", () => {
    expectTypeOf<TimeField>().toHaveProperty("origin_m").toEqualTypeOf<[number, number]>();
    expectTypeOf<TimeField>().toHaveProperty("prev").toEqualTypeOf<Int32Array>();
    expectTypeOf<TimeField>().toHaveProperty("seconds").toEqualTypeOf<Float64Array>();
    expectTypeOf<TimeField>().toHaveProperty("cell_m").toEqualTypeOf<number>();
  });
  it("field builders", () => {
    expectTypeOf(compute.habTimeField).parameters.toEqualTypeOf<[LoadedGrid, XY, MissionScenario]>();
    expectTypeOf(compute.habTimeField).returns.toEqualTypeOf<TimeField>();
    expectTypeOf(compute.vehicleTimeField).parameters.toEqualTypeOf<[LoadedGrid, XY, ParamSet]>();
    expectTypeOf(compute.vehicleTimeField).returns.toEqualTypeOf<TimeField>();
    expectTypeOf(compute.crewTimeField).parameters.toEqualTypeOf<[LoadedGrid, XY, MissionScenario, number]>();
    expectTypeOf(compute.crewTimeField).returns.toEqualTypeOf<TimeField>();
  });
  it("havenAlongRoute takes the ingress split and returns seconds per sample", () => {
    expectTypeOf(compute.havenAlongRoute).parameters.toEqualTypeOf<[XY[], TimeField, TimeField | null, MissionScenario, HavenIngress]>();
    expectTypeOf(compute.havenAlongRoute).returns.toEqualTypeOf<number[]>();
    expectTypeOf<HavenIngress>().toEqualTypeOf<{ hab_s: number; vehicle_s: number }>();
  });
  it("vehiclePassable, timeAt, pathTo, liveHaven", () => {
    expectTypeOf(compute.vehiclePassable).parameters.toEqualTypeOf<[LoadedGrid, ParamSet]>();
    expectTypeOf(compute.vehiclePassable).returns.toEqualTypeOf<Uint8Array>();
    expectTypeOf(compute.timeAt).parameters.toEqualTypeOf<[TimeField, number, number]>();
    expectTypeOf(compute.timeAt).returns.toEqualTypeOf<number>();
    expectTypeOf(compute.pathTo).parameters.toEqualTypeOf<[TimeField, number, number]>();
    expectTypeOf(compute.pathTo).returns.toEqualTypeOf<[number, number][]>();
    expectTypeOf(compute.liveHaven).parameters.toEqualTypeOf<[TimeField, TimeField, TimeField | null, Uint8Array | null, HavenIngress, XY]>();
    expectTypeOf(compute.liveHaven).returns.toEqualTypeOf<LiveHaven>();
    expectTypeOf<LiveHaven>().toEqualTypeOf<{ haven_s: number; kind: "hab" | "vehicle"; target_x_m: number; target_y_m: number }>();
  });
});

describe("C15 rendezvous signatures (02 §D.10)", () => {
  it("rendezvous", () => {
    expectTypeOf(compute.rendezvous).parameters.toEqualTypeOf<[TimeField, TimeField, Uint8Array]>();
    expectTypeOf(compute.rendezvous).returns.toEqualTypeOf<RendezvousResult>();
  });
  it("RendezvousOk is the OK arm of the result", () => {
    expectTypeOf<RendezvousOk>().toEqualTypeOf<Extract<RendezvousResult, { status: "OK" }>>();
    expectTypeOf<RendezvousOk>().toHaveProperty("crew_path").toEqualTypeOf<[number, number][]>();
  });
  it("rendezvousPair compares both visiting orders and reports the later arrival", () => {
    expectTypeOf(compute.rendezvousPair).parameters.toEqualTypeOf<[RendezvousOk, RendezvousOk, TimeField, TimeField]>();
    expectTypeOf(compute.rendezvousPair).returns.toEqualTypeOf<{ order: [0, 1] | [1, 0]; later_arrival_s: number }>();
  });
});

describe("C15 event dose and consumables (implemented, pinned)", () => {
  it("integrateDose returns EventDose", () => {
    expectTypeOf(compute.integrateDose).returns.toEqualTypeOf<EventDose>();
    expectTypeOf<EventDose>().toEqualTypeOf<{ received_ugy: number; unsheltered_ugy: number; gap_s: number }>();
  });
  it("rateAt, triggerState, stepO2, o2RemainingS", () => {
    expectTypeOf(compute.rateAt).parameters.toEqualTypeOf<[DoseSeries, string]>();
    expectTypeOf(compute.rateAt).returns.toEqualTypeOf<number | null>();
    expectTypeOf(compute.triggerState).parameters.toEqualTypeOf<[DoseSeries, string, ParamSet]>();
    expectTypeOf(compute.triggerState).returns.toEqualTypeOf<"nominal" | "alert">();
    expectTypeOf(compute.stepO2).parameters.toEqualTypeOf<[number, "walking" | "resting", number, ParamSet]>();
    expectTypeOf(compute.o2RemainingS).parameters.toEqualTypeOf<[number, "walking" | "resting", ParamSet]>();
  });
});

describe("C15 contingency signatures (02 §D.15)", () => {
  it("ContingencyInputs keeps the three names the Hab Core tests read", () => {
    expectTypeOf<ContingencyInputs>().toHaveProperty("alert_id").toEqualTypeOf<string>();
    expectTypeOf<ContingencyInputs>().toHaveProperty("crew").toEqualTypeOf<Crew[]>();
    expectTypeOf<ContingencyInputs>().toHaveProperty("now_utc").toEqualTypeOf<string>();
  });
  it("ContingencyInputs carries the plan, limits and ingress split §D.15 needs", () => {
    expectTypeOf<ContingencyInputs>().toHaveProperty("hab").toEqualTypeOf<TimeField>();
    expectTypeOf<ContingencyInputs>().toHaveProperty("rendezvous").toEqualTypeOf<Partial<Record<CrewId, RendezvousResult>>>();
    expectTypeOf<ContingencyInputs>().toHaveProperty("ingress").toEqualTypeOf<HavenIngress>();
    expectTypeOf<ContingencyInputs>().toHaveProperty("plan").toEqualTypeOf<{ waypoints: Waypoint[]; legs: Leg[] }>();
    expectTypeOf<ContingencyInputs>().toHaveProperty("scenario").toEqualTypeOf<MissionScenario>();
    expectTypeOf<ContingencyInputs>().toHaveProperty("series").toEqualTypeOf<DoseSeries>();
    expectTypeOf<ContingencyInputs>().toHaveProperty("shielding").toEqualTypeOf<ParamSet>();
    expectTypeOf<ContingencyInputs>().not.toHaveProperty("ingress_s");
  });
  it("proposeOptions", () => {
    expectTypeOf(compute.proposeOptions).parameters.toEqualTypeOf<[ContingencyInputs]>();
  });
});
