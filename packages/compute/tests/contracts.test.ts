import { describe, expect, expectTypeOf, it } from "vitest";
import type { ContingencyOption, Crew, CrewId, DoseSeries, Leg, MissionScenario, ParamSet, Waypoint } from "@marswalk/protocol";
import * as compute from "../src";
import type {
  ContingencyInputs,
  HavenIngress,
  LiveHaven,
  LoadedGrid,
  RendezvousOk,
  RendezvousPair,
  RendezvousResult,
  TimeField,
} from "../src";

// Contract C15 (docs/tasks/_coordination.md): the frozen signatures of the v2 compute modules
// haven.ts, rendezvous.ts and contingency.ts (docs/specs/02 §D.8, §D.10, §D.15). T05b.01.
// Anjim Hossain's modules (viewshed, linkGraph, earthLink, eventDose, consumables) are NOT frozen:
// they only get "exists as a function" checks until he accepts or rejects the proposals.
// Types and names only: no test here calls a stub, except the one that proves each frozen stub
// still throws `TODO(TASK-05b): not implemented`. `expectTypeOf` is checked by `tsc` (make typecheck).

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
  // 02 §D.15
  "proposeOptions",
] as const;

const NOT_FROZEN_ANJIM_FUNCTIONS = [
  // viewshed.ts, 02 §D.11
  "horizonDistanceM",
  "lineOfSight",
  "viewshed",
  // linkGraph.ts, 02 §D.11; earthLink.ts, 02 §D.12
  "linkStates",
  "linkAt",
  "nextPassStart",
  "inConjunction",
  "deliveryTime",
  // eventDose.ts, 02 §D.13; consumables.ts, 02 §D.14
  "rateAt",
  "triggerState",
  "integrateDose",
  "stepO2",
  "o2RemainingS",
] as const;

describe("C15 exported names (frozen: haven, rendezvous, contingency)", () => {
  it.each(FROZEN_FUNCTIONS)("%s is exported as a function", (name) => {
    expect(typeof (compute as Record<string, unknown>)[name]).toBe("function");
  });
  // haven.ts left this list when T05b.04 implemented it (tests/haven.test.ts); each later module leaves it the same way.
  const implemented = new Set<string>(["habTimeField", "vehicleTimeField", "crewTimeField", "havenAlongRoute", "vehiclePassable", "timeAt", "pathTo", "liveHaven"]);
  it.each(FROZEN_FUNCTIONS.filter((name) => !implemented.has(name)))("%s is still a stub that throws", (name) => {
    const stub = (compute as unknown as Record<string, () => unknown>)[name];
    expect(() => stub()).toThrow("TODO(TASK-05b): not implemented");
  });
});

describe("C15 not frozen (Anjim's modules): exported names only", () => {
  it.each(NOT_FROZEN_ANJIM_FUNCTIONS)("%s is exported as a function", (name) => {
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
  it("havenAlongRoute takes the grid and the ingress split and returns seconds per sample", () => {
    expectTypeOf(compute.havenAlongRoute).parameters.toEqualTypeOf<[LoadedGrid, XY[], TimeField, TimeField | null, MissionScenario, HavenIngress]>();
    expectTypeOf(compute.havenAlongRoute).returns.toEqualTypeOf<number[]>();
    expectTypeOf<HavenIngress>().toEqualTypeOf<{ hab_s: number; vehicle_s: number }>();
  });
  it("vehiclePassable, timeAt, pathTo, liveHaven (null = no haven reachable)", () => {
    expectTypeOf(compute.vehiclePassable).parameters.toEqualTypeOf<[LoadedGrid, ParamSet]>();
    expectTypeOf(compute.vehiclePassable).returns.toEqualTypeOf<Uint8Array>();
    expectTypeOf(compute.timeAt).parameters.toEqualTypeOf<[TimeField, number, number]>();
    expectTypeOf(compute.timeAt).returns.toEqualTypeOf<number>();
    expectTypeOf(compute.pathTo).parameters.toEqualTypeOf<[TimeField, number, number]>();
    expectTypeOf(compute.pathTo).returns.toEqualTypeOf<[number, number][]>();
    expectTypeOf(compute.liveHaven).parameters.toEqualTypeOf<[TimeField, TimeField, TimeField | null, Uint8Array | null, HavenIngress, XY]>();
    expectTypeOf(compute.liveHaven).returns.toEqualTypeOf<LiveHaven | null>();
    expectTypeOf<LiveHaven>().toEqualTypeOf<{ haven_s: number; kind: "hab" | "vehicle"; target_x_m: number; target_y_m: number }>();
  });
});

describe("C15 rendezvous signatures (02 §D.10)", () => {
  it("rendezvous", () => {
    expectTypeOf(compute.rendezvous).parameters.toEqualTypeOf<[TimeField, TimeField, Uint8Array]>();
    expectTypeOf(compute.rendezvous).returns.toEqualTypeOf<RendezvousResult>();
  });
  it("RendezvousResult has an OK arm with every field and a bare NO_RENDEZVOUS arm", () => {
    expectTypeOf<RendezvousResult>().toEqualTypeOf<
      | { status: "OK"; x_m: number; y_m: number; eta_crew_s: number; eta_vehicle_s: number; crew_path: [number, number][]; vehicle_path: [number, number][] }
      | { status: "NO_RENDEZVOUS" }
    >();
    expectTypeOf<Extract<RendezvousResult, { status: "NO_RENDEZVOUS" }>>().toEqualTypeOf<{ status: "NO_RENDEZVOUS" }>();
  });
  it("RendezvousOk is the OK arm of the result", () => {
    expectTypeOf<RendezvousOk>().toEqualTypeOf<Extract<RendezvousResult, { status: "OK" }>>();
    expectTypeOf<RendezvousOk>().toHaveProperty("crew_path").toEqualTypeOf<[number, number][]>();
  });
  it("rendezvousPair compares both visiting orders and reports the later arrival", () => {
    expectTypeOf(compute.rendezvousPair).parameters.toEqualTypeOf<[RendezvousOk, RendezvousOk, TimeField, TimeField]>();
    expectTypeOf(compute.rendezvousPair).returns.toEqualTypeOf<RendezvousPair>();
    expectTypeOf<RendezvousPair>().toEqualTypeOf<{ order: [0, 1] | [1, 0]; later_arrival_s: number }>();
  });
});

describe("C15 contingency signatures (02 §D.15)", () => {
  it("ContingencyInputs is exactly the frozen shape", () => {
    expectTypeOf<ContingencyInputs>().toEqualTypeOf<{
      alert_id: string;
      crew: Crew[];
      now_utc: string;
      hab: TimeField;
      rendezvous: Partial<Record<CrewId, RendezvousResult>>;
      ingress: HavenIngress;
      pair?: RendezvousPair;
      plan: { waypoints: Waypoint[]; legs: Leg[] };
      scenario: MissionScenario;
      series: DoseSeries;
      shielding: ParamSet;
    }>();
  });
  it("proposeOptions", () => {
    expectTypeOf(compute.proposeOptions).parameters.toEqualTypeOf<[ContingencyInputs]>();
    expectTypeOf(compute.proposeOptions).returns.toEqualTypeOf<ContingencyOption[]>();
  });
});
