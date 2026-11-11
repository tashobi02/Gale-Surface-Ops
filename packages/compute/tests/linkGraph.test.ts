import type { ParamSet } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import {
  HAB_NODE_ID,
  linkStates,
  type LinkNode,
  type LinkNodeState,
} from "../src/linkGraph";

const mockParams: ParamSet = {
  param_set_id: "link-assumed",
  kind: "link",
  title: "Surface radio and Earth link",
  values: {
    range_hab_suit_m: 10000,
    range_suit_suit_m: 2000,
    range_rover_m: 5000,
    hab_mast_m: 10,
    relay_min_elev_deg: 10,
    conjunction_deg: 3,
    dte_enabled: false,
  },
  provenance: "assumed",
  source_ids: [],
};

const hab: LinkNode = {
  node_id: "HAB",
  kind: "hab",
  x_m: 0,
  y_m: 0,
  antenna_m: 10,
};

describe("linkStates (02 §A.5, §D.11; FR-42)", () => {
  it("an edge exists only with mutual LOS and distance within ParamSet range", () => {
    const suitNear: LinkNode = {
      node_id: "EV1",
      kind: "suit",
      x_m: 5000, // 5 km <= 10 km range
      y_m: 0,
      antenna_m: 2,
    };

    const suitFar: LinkNode = {
      node_id: "EV2",
      kind: "suit",
      x_m: 12000, // 12 km > 10 km range
      y_m: 0,
      antenna_m: 2,
    };

    // Both have LOS to hab
    const losAllTrue = () => true;
    const states = linkStates([hab, suitNear, suitFar], losAllTrue, mockParams, "2026-11-10T12:00:00Z");

    const habState = states.find((s) => s.node_id === "HAB")!;
    const nearState = states.find((s) => s.node_id === "EV1")!;
    const farState = states.find((s) => s.node_id === "EV2")!;

    // suitNear has edge with HAB
    expect(habState.neighbors).toContain("EV1");
    expect(nearState.neighbors).toContain("HAB");
    expect(nearState.linked_to_hab).toBe(true);

    // suitFar is out of range, so no edge to HAB
    expect(habState.neighbors).not.toContain("EV2");
    expect(farState.neighbors).not.toContain("HAB");
    expect(farState.linked_to_hab).toBe(false);

    // If LOS is false, no edge even within range
    const losNoEV1 = (a: LinkNode, b: LinkNode) => !(a.node_id === "EV1" || b.node_id === "EV1");
    const statesNoLOS = linkStates([hab, suitNear], losNoEV1, mockParams, "2026-11-10T12:00:00Z");
    const nearStateNoLOS = statesNoLOS.find((s) => s.node_id === "EV1")!;
    expect(nearStateNoLOS.neighbors).toEqual([]);
    expect(nearStateNoLOS.linked_to_hab).toBe(false);
  });

  it("links a suit directly, through a buddy suit, or through a relay rover", () => {
    // HAB at (0, 0)
    // EV1 at (5000, 0) -> directly in range of HAB (10 km)
    // EV2 at (6500, 0) -> 6.5 km from HAB (in range of HAB), but suppose LOS to HAB is blocked
    // EV2 is within 1500 m of EV1 (suit-suit range is 2000 m), with LOS to EV1
    const ev1: LinkNode = { node_id: "EV1", kind: "suit", x_m: 5000, y_m: 0, antenna_m: 2 };
    const ev2: LinkNode = { node_id: "EV2", kind: "suit", x_m: 6500, y_m: 0, antenna_m: 2 };

    // EV2 has no LOS to HAB, but EV1 has LOS to HAB and EV1 <-> EV2 has LOS
    const losBuddy = (a: LinkNode, b: LinkNode) => {
      const pair = [a.node_id, b.node_id].sort().join("-");
      if (pair === "EV2-HAB") return false;
      return true;
    };

    const buddyStates = linkStates([hab, ev1, ev2], losBuddy, mockParams, "2026-11-10T12:00:00Z");
    const ev2Buddy = buddyStates.find((s) => s.node_id === "EV2")!;
    expect(ev2Buddy.linked_to_hab).toBe(true);
    expect(ev2Buddy.path_to_hab).toEqual(["EV2", "EV1", "HAB"]);

    // Relay rover scenario:
    // Rover RR1 at (4000, 1000), EV3 at (7000, 1000)
    // EV3 has no LOS to HAB and is out of suit-suit range of EV1.
    // EV3 is 3 km from RR1 (< 5 km rover range) with LOS to RR1.
    // RR1 is ~4.12 km from HAB (< 5 km rover range) with LOS to HAB.
    const rover: LinkNode = { node_id: "RR1", kind: "rover", x_m: 4000, y_m: 1000, antenna_m: 2.5 };
    const ev3: LinkNode = { node_id: "EV3", kind: "suit", x_m: 7000, y_m: 1000, antenna_m: 2 };

    const losRelay = (a: LinkNode, b: LinkNode) => {
      const pair = [a.node_id, b.node_id].sort().join("-");
      if (pair === "EV3-HAB") return false;
      if (pair === "EV1-EV3") return false;
      return true;
    };

    const relayStates = linkStates([hab, ev1, rover, ev3], losRelay, mockParams, "2026-11-10T12:00:00Z");
    const ev3State = relayStates.find((s) => s.node_id === "EV3")!;
    expect(ev3State.linked_to_hab).toBe(true);
    expect(ev3State.path_to_hab).toEqual(["EV3", "RR1", "HAB"]);

    // Completely unlinked suit
    const evIsolated: LinkNode = { node_id: "EV_ISO", kind: "suit", x_m: 30000, y_m: 30000, antenna_m: 2 };
    const isolatedStates = linkStates([hab, evIsolated], () => true, mockParams, "2026-11-10T12:00:00Z");
    const isoState = isolatedStates.find((s) => s.node_id === "EV_ISO")!;
    expect(isoState.linked_to_hab).toBe(false);
    expect(isoState.path_to_hab).toEqual([]);
    expect(isoState.neighbors).toEqual([]);
  });

  it("BFS order is deterministic across repeated runs and tie-breaks", () => {
    // Two equidistant rovers RR1 and RR2 linking EV1 to HAB
    const rr1: LinkNode = { node_id: "RR1", kind: "rover", x_m: 3000, y_m: 1000, antenna_m: 2.5 };
    const rr2: LinkNode = { node_id: "RR2", kind: "rover", x_m: 3000, y_m: -1000, antenna_m: 2.5 };
    const ev1: LinkNode = { node_id: "EV1", kind: "suit", x_m: 6000, y_m: 0, antenna_m: 2 };

    const los = (a: LinkNode, b: LinkNode) => {
      const pair = [a.node_id, b.node_id].sort().join("-");
      if (pair === "EV1-HAB") return false; // blocked directly to HAB
      return true;
    };

    const run1 = linkStates([hab, rr1, rr2, ev1], los, mockParams, "2026-11-10T12:00:00Z");
    const run2 = linkStates([hab, rr2, rr1, ev1], los, mockParams, "2026-11-10T12:00:00Z");

    const ev1Run1 = run1.find((s) => s.node_id === "EV1")!;
    const ev1Run2 = run2.find((s) => s.node_id === "EV1")!;

    expect(ev1Run1.path_to_hab).toEqual(ev1Run2.path_to_hab);
    // Alphabetical tie-break: RR1 before RR2
    expect(ev1Run1.path_to_hab).toEqual(["EV1", "RR1", "HAB"]);
  });

  it("tracks since_sim_time based on previous link state", () => {
    const suit: LinkNode = { node_id: "EV1", kind: "suit", x_m: 1000, y_m: 0, antenna_m: 2 };

    const t1 = "2026-11-10T12:00:00Z";
    const initial = linkStates([hab, suit], () => true, mockParams, t1);
    expect(initial.find((s) => s.node_id === "EV1")!.since_sim_time).toBe(t1);

    // State remains linked at t2 -> since_sim_time remains t1
    const t2 = "2026-11-10T12:01:00Z";
    const step2 = linkStates([hab, suit], () => true, mockParams, t2, initial);
    expect(step2.find((s) => s.node_id === "EV1")!.since_sim_time).toBe(t1);

    // State becomes unlinked at t3 -> since_sim_time updates to t3
    const t3 = "2026-11-10T12:02:00Z";
    const step3 = linkStates([hab, suit], () => false, mockParams, t3, step2);
    expect(step3.find((s) => s.node_id === "EV1")!.since_sim_time).toBe(t3);
  });

  it("exports HAB_NODE_ID constant as HAB", () => {
    expect(HAB_NODE_ID).toBe("HAB");
  });
});

describe("linkStates ranges come from the ParamSet (02 §D.11 ranges; 05 ParamSet `link`)", () => {
  const T = "2026-11-10T12:00:00Z";
  const allLos = () => true;
  const withValues = (values: Record<string, number | boolean>): ParamSet => ({ ...mockParams, values });
  const neighborsOf = (states: LinkNodeState[], id: string): string[] =>
    states.find((s) => s.node_id === id)!.neighbors;

  it("suit to suit at 2.1 km is not linked, but a suit at 2.1 km from the hab is", () => {
    const suitSuitM = mockParams.values.range_suit_suit_m as number;
    const habSuitM = mockParams.values.range_hab_suit_m as number;
    const d = suitSuitM + 100; // 2.1 km with the committed ParamSet
    expect(d).toBeLessThanOrEqual(habSuitM);

    const a: LinkNode = { node_id: "EV1", kind: "suit", x_m: d, y_m: 0, antenna_m: 2 };
    const b: LinkNode = { node_id: "EV2", kind: "suit", x_m: 2 * d, y_m: 0, antenna_m: 2 };
    // EV1 is d from the hab (linked); EV2 is d from EV1 (suit-suit, too far) and 2d from the hab (hab-suit, fine
    // in range) but the hab has no LOS to EV2 here, so only the suit-suit rule can decide EV2.
    const los = (u: LinkNode, v: LinkNode) => !(u.node_id === "EV2" && v.node_id === "HAB") && !(u.node_id === "HAB" && v.node_id === "EV2");
    const states = linkStates([hab, a, b], los, mockParams, T);
    expect(neighborsOf(states, "EV1")).toEqual(["HAB"]);
    expect(neighborsOf(states, "EV1")).not.toContain("EV2");
    expect(states.find((s) => s.node_id === "EV2")!.linked_to_hab).toBe(false);
  });

  it("rover range is inclusive at exactly range_rover_m and exclusive one metre beyond", () => {
    const roverM = mockParams.values.range_rover_m as number;
    const onEdge: LinkNode = { node_id: "RR1", kind: "rover", x_m: roverM, y_m: 0, antenna_m: 2.5 };
    const beyond: LinkNode = { node_id: "RR2", kind: "rover", x_m: 0, y_m: roverM + 1, antenna_m: 2.5 };
    const states = linkStates([hab, onEdge, beyond], allLos, mockParams, T);
    expect(neighborsOf(states, "RR1")).toContain("HAB");
    expect(states.find((s) => s.node_id === "RR1")!.linked_to_hab).toBe(true);
    expect(neighborsOf(states, "RR2")).not.toContain("HAB");
  });

  it("uses the ParamSet value, not a built-in one: a shorter suit-suit range cuts a 1.5 km edge", () => {
    const a: LinkNode = { node_id: "EV1", kind: "suit", x_m: 1000, y_m: 0, antenna_m: 2 };
    const b: LinkNode = { node_id: "EV2", kind: "suit", x_m: 2500, y_m: 0, antenna_m: 2 };
    const noHabToB = (u: LinkNode, v: LinkNode) => ![u.node_id, v.node_id].every((id) => id === "HAB" || id === "EV2");
    const wide = linkStates([hab, a, b], noHabToB, mockParams, T);
    expect(neighborsOf(wide, "EV1")).toContain("EV2");
    const narrow = linkStates([hab, a, b], noHabToB, withValues({ ...mockParams.values, range_suit_suit_m: 1000 }), T);
    expect(neighborsOf(narrow, "EV1")).not.toContain("EV2");
  });

  it.each(["range_hab_suit_m", "range_suit_suit_m", "range_rover_m"])(
    "throws RangeError naming %s when the ParamSet lacks it",
    (key) => {
      const values = { ...mockParams.values };
      delete values[key];
      expect(() => linkStates([hab], allLos, withValues(values), T)).toThrow(RangeError);
      expect(() => linkStates([hab], allLos, withValues(values), T)).toThrow(key);
    },
  );

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a negative number", -1],
    ["a boolean", true],
  ])("throws RangeError when a range is %s (a NaN range must not mean unlimited range)", (_label, bad) => {
    for (const key of ["range_hab_suit_m", "range_suit_suit_m", "range_rover_m"]) {
      const values = { ...mockParams.values, [key]: bad };
      expect(() => linkStates([hab], allLos, withValues(values), T)).toThrow(RangeError);
    }
  });

  it("orders neighbours and breaks BFS ties by UTF-16 code unit, not by locale", () => {
    // Code-unit order puts "Z" (0x5A) before "a" (0x61); localeCompare puts "a" first.
    const rz: LinkNode = { node_id: "Z", kind: "rover", x_m: 1000, y_m: 500, antenna_m: 2.5 };
    const ra: LinkNode = { node_id: "a", kind: "rover", x_m: 1000, y_m: -500, antenna_m: 2.5 };
    const ev: LinkNode = { node_id: "EV1", kind: "suit", x_m: 2000, y_m: 0, antenna_m: 2 };
    const noDirect = (u: LinkNode, v: LinkNode) => ![u.node_id, v.node_id].every((id) => id === "HAB" || id === "EV1");
    const states = linkStates([hab, ra, rz, ev], noDirect, mockParams, T);
    expect(neighborsOf(states, "HAB")).toEqual(["Z", "a"]);
    expect(states.find((s) => s.node_id === "EV1")!.path_to_hab).toEqual(["EV1", "Z", "HAB"]);
  });
});
