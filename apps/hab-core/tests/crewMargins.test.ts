/**
 * T32.30: per-crew O₂ time left, bearing, distance and ETA to the next stop (docs/specs/01 FR-32, FR-33, FR-35; 02 §C.1,
 * §D.14; 05 Crew; backend decision BD-95). Runs on the fake scenario (F8): both crew leave the hab at (0, 0) and walk +x
 * along y = 0 to wp-1 (1000 m) and wp-2 (2000 m); each leg takes `walk_time_min × 60` s, each dwell `dwell_min_per_stop × 60` s.
 *
 * BD-95's choices, named in the test titles (decided by the orchestrator, 12 Nov 2026):
 * - O₂ time: minutes at the current activity from compute `o2RemainingS` (walking, resting); null when the suit is not
 *   consuming (in the hab, waiting out a start offset, sheltered in a vehicle or the hab).
 * - The next stop is per crew member: their lowest-index stop without their own ARRIVED_STOP. At a stop it is the following one.
 * - Bearing: 0-360 clockwise from grid north (+y), `bearingDeg`. Distance: straight-line horizontal metres, `horizontalDistanceM`.
 * - ETA: seconds until arrival along the planned route from the engine's own motion state, including the remaining dwell at
 *   the current stop (and the remaining wait of a start offset). Null when the route cannot be walked to that stop.
 * - All four are null for a crew member not on EVA, with no plan, and after the last stop.
 *
 * Expected values come from compute calls and the plan's own times, never typed constants.
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { bearingDeg, horizontalDistanceM, o2RemainingS } from "@marswalk/compute";
import type { Command, Crew, CrewId, OkLeg, Role, Snapshot } from "@marswalk/protocol";
import { crewMargins } from "../src/engine/crewMargins";
import { initialState, reduce, type EngineState } from "../src/engine/reducer";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { loadSession, resumeSession, type SessionHandle } from "../src/session";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const plan = fake.scenario.plan!;
const leg = (i: number): OkLeg => {
  const l = plan.result.legs[i];
  if (l.status !== "OK") throw new Error("the fixture's legs are OK");
  return l;
};
const stop = (id: string) => plan.waypoints.find((w) => w.id === id)!;
const LEG0_S = leg(0).walk_time_min * 60;
const LEG1_S = leg(1).walk_time_min * 60;
const DWELL_S = plan.scenario.dwell_min_per_stop * 60;
const suit = fake.params["suit-assumed"];
const FIELDS = ["o2_remaining_min", "next_stop_bearing_deg", "next_stop_distance_m", "next_stop_eta_s"] as const;

const dirs: string[] = [];
/** The plan-less variant of the fake scenario, as a scenario folder of its own (a live session before PUBLISH_PLAN). */
function planlessScenario(): LoadedScenario {
  const dir = mkdtempSync(join(tmpdir(), "marswalk-crew-margins-planless-"));
  dirs.push(dir);
  cpSync(join(here, "fixtures/fake-scenario"), dir, { recursive: true });
  writeFileSync(join(dir, "scenario.json"), readFileSync(join(dir, "scenario.planless.json")));
  return readScenario(dir, { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
}
const varDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), "marswalk-crew-margins-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

let n = 0;
const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `k-${++n}`, role, kind, args });
const snap = (s: SessionHandle): Snapshot => s.snapshot([]);
const crewOf = (s: SessionHandle, id: CrewId): Crew => snap(s).crew.find((c) => c.crew_id === id)!;
const margins = (c: Crew) => FIELDS.map((k) => c[k]);
const started = (scenario: LoadedScenario = fake): SessionHandle => {
  const s = loadSession(scenario, varDir());
  expect(s.apply(cmd("ops", "START_EVA"), "c-ops").result.ok).toBe(true);
  return s;
};
/** The fake scenario with EV2 leaving the hab `offset_s` after EV1. */
const staggered = (offset_s: number): LoadedScenario => ({ ...fake, scenario: { ...fake.scenario, crew: fake.scenario.crew.map((c) => (c.crew_id === "EV2" ? { ...c, start_offset_s: offset_s } : c)) } });
const minutes = (o2_frac: number, mode: "walking" | "resting"): number => o2RemainingS(o2_frac, mode, suit) / 60;

describe("o2_remaining_min (BD-95: minutes at the current activity, compute o2RemainingS)", () => {
  it("while walking is o2RemainingS at the walking rate, in minutes", () => {
    const s = started();
    s.advance(100);
    const c = crewOf(s, "EV1");
    expect(c.activity).toBe("WALKING");
    expect(c.o2_remaining_min).toBeCloseTo(minutes(c.o2_frac, "walking"), 9);
  });

  it("at a stop is o2RemainingS at the resting rate, so the same O₂ lasts longer than walking", () => {
    const s = started();
    s.advance(Math.ceil(LEG0_S) + 30);
    const c = crewOf(s, "EV1");
    expect(c.activity).toBe("AT_STOP");
    expect(c.o2_remaining_min).toBeCloseTo(minutes(c.o2_frac, "resting"), 9);
    expect(c.o2_remaining_min!).toBeGreaterThan(minutes(c.o2_frac, "walking"));
  });

  it("falls as the suit is used", () => {
    const s = started();
    s.advance(60);
    const a = crewOf(s, "EV1").o2_remaining_min!;
    s.advance(60);
    expect(crewOf(s, "EV1").o2_remaining_min!).toBeLessThan(a);
  });

  it("is null in the hab and for a crew member still waiting out a start offset", () => {
    const loaded = loadSession(fake, varDir());
    expect(margins(snap(loaded).crew[0])).toEqual([null, null, null, null]);
    const s = started(staggered(600));
    s.advance(100);
    expect(crewOf(s, "EV2").o2_remaining_min).toBeNull();
    expect(crewOf(s, "EV1").o2_remaining_min).not.toBeNull();
  });

  it("is null again once a crew member is back in the hab", () => {
    const s = started();
    s.advance(3 * 3600); // the whole route takes under two hours; the run stops by itself when the EVA ends
    const c = crewOf(s, "EV1");
    expect(c.activity).toBe("IN_HAB");
    expect(margins(c)).toEqual([null, null, null, null]);
  });
});

describe("next stop, bearing and distance (BD-95: per crew member, 0-360 clockwise from +y, straight-line projected metres)", () => {
  it("heads for the first stop: bearing and distance are the compute results for the crew member's position", () => {
    const s = started();
    s.advance(100);
    const c = crewOf(s, "EV1");
    const target = stop("wp-1");
    expect(c.next_stop_bearing_deg).toBe(bearingDeg({ x_m: c.x_m, y_m: c.y_m }, { x_m: target.x_m, y_m: target.y_m }));
    expect(c.next_stop_distance_m).toBe(horizontalDistanceM({ x_m: c.x_m, y_m: c.y_m }, { x_m: target.x_m, y_m: target.y_m }));
    expect(c.next_stop_distance_m!).toBeLessThan(horizontalDistanceM({ x_m: 0, y_m: 0 }, { x_m: target.x_m, y_m: target.y_m }));
  });

  it("at a stop the next stop is the following one, not the one they stand at", () => {
    const s = started();
    s.advance(Math.ceil(LEG0_S) + 30);
    const c = crewOf(s, "EV1");
    const target = stop("wp-2");
    expect(c.stop_index).toBe(1);
    expect(c.next_stop_bearing_deg).toBe(bearingDeg({ x_m: c.x_m, y_m: c.y_m }, { x_m: target.x_m, y_m: target.y_m }));
    expect(c.next_stop_distance_m).toBe(horizontalDistanceM({ x_m: c.x_m, y_m: c.y_m }, { x_m: target.x_m, y_m: target.y_m }));
  });

  it("is per crew member: while EV1 dwells at stop 1 and looks at stop 2, EV2 is still walking to stop 1", () => {
    const s = started(staggered(300));
    s.advance(Math.ceil(LEG0_S) + 60);
    const ev1 = crewOf(s, "EV1");
    const ev2 = crewOf(s, "EV2");
    expect(ev1.activity).toBe("AT_STOP");
    expect(ev2.activity).toBe("WALKING");
    expect(ev1.next_stop_distance_m).toBe(horizontalDistanceM({ x_m: ev1.x_m, y_m: ev1.y_m }, { x_m: stop("wp-2").x_m, y_m: stop("wp-2").y_m }));
    expect(ev2.next_stop_distance_m).toBe(horizontalDistanceM({ x_m: ev2.x_m, y_m: ev2.y_m }, { x_m: stop("wp-1").x_m, y_m: stop("wp-1").y_m }));
    // The crew-wide target of JUMP_NEXT_STOP (02 §D.17) is unchanged: the lowest stop not everyone has reached.
    expect(snap(s).next_stop_target).toEqual({ stop_id: "wp-1", stop_index: 1 });
  });

  it("is a bearing in [0, 360) that points along +x for the fixture's eastward route", () => {
    const s = started();
    s.advance(100);
    const b = crewOf(s, "EV1").next_stop_bearing_deg!;
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
    expect(b).toBe(bearingDeg({ x_m: 0, y_m: 0 }, { x_m: 1, y_m: 0 }));
  });

  it("for a crew member waiting out a start offset, still at the hab, points from the hab", () => {
    const s = started(staggered(600));
    s.advance(100);
    const c = crewOf(s, "EV2");
    expect([c.x_m, c.y_m]).toEqual([0, 0]);
    expect(c.next_stop_distance_m).toBe(horizontalDistanceM({ x_m: 0, y_m: 0 }, { x_m: stop("wp-1").x_m, y_m: stop("wp-1").y_m }));
    expect(c.next_stop_bearing_deg).toBe(bearingDeg({ x_m: 0, y_m: 0 }, { x_m: stop("wp-1").x_m, y_m: stop("wp-1").y_m }));
  });
});

describe("next_stop_eta_s (BD-95: along the planned route, from the engine's motion state, including the remaining dwell)", () => {
  it("while walking leg 0 is the leg's remaining time", () => {
    const s = started();
    s.advance(100);
    expect(crewOf(s, "EV1").next_stop_eta_s).toBeCloseTo(LEG0_S - 100, 6);
  });

  it("falls by one second per tick while walking", () => {
    const s = started();
    s.advance(100);
    const a = crewOf(s, "EV1").next_stop_eta_s!;
    s.advance(10);
    expect(crewOf(s, "EV1").next_stop_eta_s!).toBeCloseTo(a - 10, 6);
  });

  it("at a stop includes the remaining dwell, then the walk to the following stop", () => {
    const s = started();
    const ticks = Math.ceil(LEG0_S) + 10;
    s.advance(ticks);
    const c = crewOf(s, "EV1");
    expect(c.activity).toBe("AT_STOP");
    const dwelled = ticks - LEG0_S; // time carries over from the arrival second into the dwell
    expect(c.next_stop_eta_s).toBeCloseTo(DWELL_S - dwelled + LEG1_S, 6);
  });

  it("for a crew member waiting out a start offset includes the wait", () => {
    const s = started(staggered(600));
    s.advance(100);
    expect(crewOf(s, "EV2").next_stop_eta_s).toBeCloseTo(600 - 100 + LEG0_S, 6);
  });

  it("is the plan's own leg time, not rounded: after one second it is the leg time less one", () => {
    const s = started();
    s.advance(1);
    expect(crewOf(s, "EV1").next_stop_eta_s).toBe(LEG0_S - 1);
  });

  it("is null when the route has no leg to that stop (a stop no leg visits)", () => {
    const out = leg(0);
    const edited = { ...plan, result: { ...plan.result, legs: [out] } };
    const s = started({ ...fake, scenario: { ...fake.scenario, plan: edited } });
    s.advance(Math.ceil(LEG0_S) + 10); // at stop 1; stop 2 has no leg
    const c = crewOf(s, "EV1");
    expect(c.next_stop_eta_s).toBeNull();
    expect(c.next_stop_distance_m).not.toBeNull(); // still a straight line to it
  });
});

describe("null values (BD-95: no plan, not on EVA, no stop left)", () => {
  it("a plan-less session has no value for any crew member", () => {
    const s = loadSession(planlessScenario(), varDir());
    expect(snap(s).plan).toBeNull();
    for (const c of snap(s).crew) expect(margins(c)).toEqual([null, null, null, null]);
  });

  it("before the EVA starts, a session with a plan has nothing to report for the crew in the hab", () => {
    const s = loadSession(fake, varDir());
    for (const c of snap(s).crew) expect(margins(c)).toEqual([null, null, null, null]);
  });

  it("at the last stop the three next-stop values are null and the O₂ time stays", () => {
    const s = started();
    s.advance(Math.ceil(LEG0_S + DWELL_S + LEG1_S) + 30);
    const c = crewOf(s, "EV1");
    expect(c.activity).toBe("AT_STOP");
    expect(c.stop_index).toBe(2);
    expect([c.next_stop_bearing_deg, c.next_stop_distance_m, c.next_stop_eta_s]).toEqual([null, null, null]);
    expect(c.o2_remaining_min).toBeCloseTo(minutes(c.o2_frac, "resting"), 9);
  });

  it("after leaving the last stop, walking back, there is no next stop", () => {
    const s = started();
    s.advance(Math.ceil(LEG0_S + DWELL_S + LEG1_S + DWELL_S) + 60);
    const c = crewOf(s, "EV1");
    expect(c.activity).toBe("WALKING");
    expect([c.next_stop_bearing_deg, c.next_stop_distance_m, c.next_stop_eta_s]).toEqual([null, null, null]);
    expect(c.o2_remaining_min).toBeCloseTo(minutes(c.o2_frac, "walking"), 9);
  });
});

describe("crewMargins on a built state (unit)", () => {
  const base = (): EngineState => {
    let state = initialState(fake, "s-unit");
    state = reduce(state, { seq: 1, sim_time: fake.scenario.start_utc, kind: "EVA_STARTED", actor: "ops", data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, provenance: {}, command_ref: null });
    return state;
  };
  const walking = () => "walking" as const;

  it("returns the four fields for a crew member on EVA and deltas for exactly the fields that changed", () => {
    const state = base();
    const first = crewMargins(state, fake, walking);
    expect(first.crew.every((c) => FIELDS.every((k) => typeof c[k] === "number"))).toBe(true);
    expect(first.deltas.map((d) => d.path).sort()).toEqual(["EV1", "EV2"].flatMap((id) => FIELDS.map((k) => `crew/${id}/${k}`)).sort());
    const again = crewMargins({ ...state, crew: first.crew }, fake, walking);
    expect(again.deltas).toEqual([]);
    expect(again.crew).toEqual(first.crew);
  });

  it("is null for a crew member sent to a haven (TO_HAVEN) apart from the O₂ time", () => {
    const state = base();
    const haven: EngineState = { ...state, crew: state.crew.map((c) => ({ ...c, activity: "TO_HAVEN" as const })) };
    const c = crewMargins(haven, fake, walking).crew[0];
    expect([c.next_stop_bearing_deg, c.next_stop_distance_m, c.next_stop_eta_s]).toEqual([null, null, null]);
    expect(c.o2_remaining_min).toBeCloseTo(minutes(c.o2_frac, "walking"), 9);
  });

  it("gives the ETA null while the motion record belongs to another plan revision, and keeps bearing and distance", () => {
    const state = base();
    const stale: EngineState = { ...state, motion: { EV1: { plan_revision: 0, phase: "walk", leg_index: 0, t_s: 5, last_wp_id: "wp-0" } } };
    const c = crewMargins(stale, fake, walking).crew.find((x) => x.crew_id === "EV1")!;
    expect(c.next_stop_eta_s).toBeNull();
    expect(c.next_stop_distance_m).not.toBeNull();
  });

  it("gives the ETA null for a held crew member (the route is over) with a stop still ahead", () => {
    const state = base();
    const held: EngineState = { ...state, motion: { EV1: { plan_revision: 1, phase: "hold", leg_index: 3, t_s: 0, last_wp_id: "wp-2" } } };
    const c = crewMargins(held, fake, walking).crew.find((x) => x.crew_id === "EV1")!;
    expect(c.next_stop_eta_s).toBeNull();
  });

  it("uses the mode the caller gives for the O₂ time and null when there is none", () => {
    const state = base();
    expect(crewMargins(state, fake, () => "resting").crew[0].o2_remaining_min).toBeCloseTo(minutes(state.crew[0].o2_frac, "resting"), 9);
    expect(crewMargins(state, fake, () => null).crew[0].o2_remaining_min).toBeNull();
  });

  it("does not change the state it is given", () => {
    const state = base();
    const copy = structuredClone(state);
    crewMargins(state, fake, walking);
    expect(state).toEqual(copy);
  });
});

describe("deltas (BD-95: only on change) and snapshots", () => {
  it("while dwelling, the bearing and distance to the next stop do not change and send no delta; the O₂ time and ETA do", () => {
    const s = started();
    s.advance(Math.ceil(LEG0_S) + 10);
    const paths = s.advance(5).deltas.map((d) => d.path);
    expect(paths).not.toContain("crew/EV1/next_stop_bearing_deg");
    expect(paths).not.toContain("crew/EV1/next_stop_distance_m");
    expect(paths).toContain("crew/EV1/o2_remaining_min");
    expect(paths).toContain("crew/EV1/next_stop_eta_s");
  });

  it("while walking, every field that moves is sent for the crew member that moved", () => {
    const s = started();
    s.advance(10);
    const paths = s.advance(1).deltas.map((d) => d.path);
    for (const k of ["o2_remaining_min", "next_stop_distance_m", "next_stop_eta_s"]) expect(paths).toContain(`crew/EV1/${k}`);
  });

  it("the fields are in every SNAPSHOT (null before the EVA), with their provenance labels", () => {
    const s = loadSession(fake, varDir());
    for (const c of snap(s).crew) for (const k of FIELDS) expect(Object.prototype.hasOwnProperty.call(c, k)).toBe(true);
    const running = started();
    running.advance(5);
    const sn = snap(running);
    for (const c of sn.crew) for (const k of FIELDS) expect(typeof c[k]).toBe("number");
    expect(sn.provenance).toMatchObject({
      "crew.o2_remaining_min": "simulated",
      "crew.next_stop_bearing_deg": "derived",
      "crew.next_stop_distance_m": "derived",
      "crew.next_stop_eta_s": "modelled",
    });
  });

  it("a resumed session has the same values as the live one (NFR-10)", () => {
    const dir = varDir();
    const live = loadSession(fake, dir);
    live.apply(cmd("ops", "START_EVA"), "c-ops");
    // A resume re-runs ticks only up to the last logged event (session.ts), so the live run stops at one: the arrival at stop 1.
    live.advance(Math.ceil(LEG0_S));
    expect(live.eventsAfter(0).at(-1)!.kind).toBe("ARRIVED_STOP");
    const resumed = resumeSession(join(dir, "sessions", snap(live).session.session_id), fake);
    for (const id of ["EV1", "EV2"] as const) expect(margins(crewOf(resumed, id))).toEqual(margins(crewOf(live, id)));
  });
});

describe("JUMP_NEXT_STOP and a walked run give the same values (BD-95)", () => {
  it("after the jump to stop 1 the margins equal those of a session that walked the same seconds", () => {
    const jumped = started();
    expect(jumped.apply(cmd("presenter", "JUMP_NEXT_STOP"), "c-pres").result.ok).toBe(true);
    const seconds = (Date.parse(snap(jumped).sim_time) - Date.parse(fake.scenario.start_utc)) / 1000;
    const walked = started();
    walked.advance(seconds);
    expect(snap(walked).sim_time).toBe(snap(jumped).sim_time);
    for (const id of ["EV1", "EV2"] as const) expect(margins(crewOf(jumped, id))).toEqual(margins(crewOf(walked, id)));
  });

  it("after a second jump (through the dwell) they still equal a walked run", () => {
    const jumped = started();
    jumped.apply(cmd("presenter", "JUMP_NEXT_STOP"), "c-pres");
    jumped.apply(cmd("presenter", "JUMP_NEXT_STOP"), "c-pres");
    const seconds = (Date.parse(snap(jumped).sim_time) - Date.parse(fake.scenario.start_utc)) / 1000;
    const walked = started();
    walked.advance(seconds);
    for (const id of ["EV1", "EV2"] as const) expect(margins(crewOf(jumped, id))).toEqual(margins(crewOf(walked, id)));
  });
});
