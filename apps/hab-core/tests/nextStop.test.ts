/**
 * T32.09: `JUMP_NEXT_STOP` (Next stop) and `Snapshot.next_stop_target` (docs/specs/02 §D.17, §D.14; 01 FR-51, U-63;
 * backend decisions BD-92, BD-97, BD-104). Runs on the fake scenario (F8): both crew leave the hab together, leg 0 takes
 * `walk_time_min × 60` s, the dwell is `dwell_min_per_stop × 60` s.
 *
 * Rules fixed here (decided by the orchestrator, 12 Nov 2026, backend decisions BD-92, BD-97, BD-113):
 * - The target is the lowest-index plan stop that not every crew member on EVA has reached; "on EVA" is WALKING or
 *   AT_STOP (a crew member sent to a haven, sheltered or in the hab is out of the count).
 * - The jump runs the ordinary 1-s ticks; every tick event keeps its own sim second; `CLOCK_JUMPED` comes last (BD-92).
 * - Several end conditions in one tick: warning alert first (U-63), then plan_revised, eva_ended, sheltered, arrival.
 * - The jump is allowed while the clock is paused (the EVA is running); speed and pause are unchanged afterwards (BD-113).
 * - A jump that reaches no end condition within the plan's maximum EVA duration (a stop no leg visits) is INVALID and
 *   changes nothing, so the log never holds a jump with no `ended_by` (BD-113).
 *
 * Each rule is one named test. The `alert` case shifts the dose series so the storm starts at the EVA start; the
 * `plan_revised` case injects the event through a mocked contingency module (no tick module revises a plan).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Command, CrewId, LogEvent, LogEventData, OkLeg, Role, Snapshot } from "@marswalk/protocol";
import { PERMISSIONS } from "@marswalk/protocol";
import { jumpEnded, nextStopTarget } from "../src/engine/nextStop";
import { initialState, reduce, type PendingEvent } from "../src/engine/reducer";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { loadSession, resumeSession, type SessionHandle } from "../src/session";

// A hook for the plan_revised case: when set, the contingency module also returns this event at this tick.
const hook = vi.hoisted(() => ({ at: null as string | null, event: null as PendingEvent | null }));
vi.mock("../src/engine/contingencyOps", async () => {
  const real = await vi.importActual<typeof import("../src/engine/contingencyOps")>("../src/engine/contingencyOps");
  return {
    ...real,
    contingencyTick: (state: Parameters<typeof real.contingencyTick>[0], ctx: Parameters<typeof real.contingencyTick>[1]) => {
      const r = real.contingencyTick(state, ctx);
      if (hook.at !== null && hook.event !== null && state.session.clock.sim_time === hook.at) return { ...r, events: [...r.events, { ...hook.event, sim_time: hook.at }] };
      return r;
    },
  };
});

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const plan = fake.scenario.plan!;
const leg = (i: number): OkLeg => {
  const l = plan.result.legs[i];
  if (l.status !== "OK") throw new Error("the fixture's legs are OK");
  return l;
};
const START = Date.parse(fake.scenario.start_utc);
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");
const LEG0_TICKS = Math.ceil(leg(0).walk_time_min * 60); // both crew arrive at stop 1 at this tick
const DWELL_S = plan.scenario.dwell_min_per_stop * 60;

const dirs: string[] = [];
const varDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), "marswalk-next-stop-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  hook.at = null;
  hook.event = null;
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

let n = 0;
const cmd = (role: Role, kind: Command["kind"], args: Record<string, unknown> = {}): Command => ({ command_id: `k-${++n}`, role, kind, args });
const snap = (s: SessionHandle): Snapshot => s.snapshot([]);
const jump = (s: SessionHandle) => s.apply(cmd("presenter", "JUMP_NEXT_STOP"), "c-presenter");
const started = (scenario: LoadedScenario = fake): SessionHandle => {
  const s = loadSession(scenario, varDir());
  expect(s.apply(cmd("ops", "START_EVA"), "c-ops").result.ok).toBe(true);
  // The shifted storm plays from the press at the EVA start (START_EVENT, T32.12); the other scenarios have no storm in reach.
  if (scenario === shiftedStorm) expect(s.apply(cmd("presenter", "START_EVENT", { event_id: "storm" }), "c-presenter").result.ok).toBe(true);
  return s;
};
const jumpedOf = (events: LogEvent[]): LogEventData["CLOCK_JUMPED"] => {
  const e = events.filter((x) => x.kind === "CLOCK_JUMPED");
  expect(e).toHaveLength(1);
  return e[0].data as LogEventData["CLOCK_JUMPED"];
};
const rejectedCode = (r: { result: { ok: boolean } }): string => {
  expect(r.result.ok).toBe(false);
  return (r.result as unknown as { code: string }).code;
};
const strip = (e: LogEvent): unknown => [e.kind, e.sim_time, e.actor, e.data];

/** The fake scenario with the dose series moved 50 min earlier: the storm starts at the EVA start (alert at tick 1200). */
const shiftedStorm: LoadedScenario = {
  ...fake,
  dose: { ...fake.dose, samples: fake.dose.samples.map(([t, r]) => [iso(Date.parse(t) - 50 * 60_000), r] as [string, number | null]) },
  scenario: { ...fake.scenario, event_library: fake.scenario.event_library.map((e) => ({ ...e, series_start_utc: iso(Date.parse(e.series_start_utc) - 50 * 60_000) })) },
};
/** A dose series with no storm at all: nothing raises an alert. */
const quiet: LoadedScenario = { ...fake, dose: { ...fake.dose, samples: fake.dose.samples.map(([t]) => [t, fake.dose.background_rate] as [string, number]) } };

/**
 * A plan that never visits its second stop: legs wp-0 → wp-1 and wp-1 → wp-0 (the end of the route, which shelters).
 * `offsets` are the crew's start offsets.
 */
function strayStop(offsets: Record<CrewId, number>): LoadedScenario {
  const out = leg(0);
  const back: OkLeg = { ...leg(1), from: "wp-1", to: "wp-0", geometry: [...out.geometry].reverse(), walk_time_min: out.walk_time_min };
  const stray = { ...plan.waypoints[2], x_m: 5000 };
  const edited = { ...plan, waypoints: [plan.waypoints[0], plan.waypoints[1], stray], result: { ...plan.result, legs: [out, back] } };
  return {
    ...quiet,
    scenario: { ...quiet.scenario, plan: edited, crew: quiet.scenario.crew.map((c) => ({ ...c, start_offset_s: offsets[c.crew_id] })) },
  };
}

describe("JUMP_NEXT_STOP: arrival (02 §D.17)", () => {
  it("brings both crew to the next planned stop with an ARRIVED_STOP for each, then logs CLOCK_JUMPED last", () => {
    const s = started();
    const { result, events } = jump(s);
    expect(result.ok).toBe(true);
    const arrivals = events.filter((e) => e.kind === "ARRIVED_STOP");
    expect(arrivals.map((e) => e.data)).toEqual([
      { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 },
      { crew_id: "EV2", stop_id: "wp-1", stop_index: 1 },
    ]);
    expect(events[events.length - 1].kind).toBe("CLOCK_JUMPED");
    expect(jumpedOf(events)).toEqual({ reason: "next_stop", from_sim_time: iso(START), to_sim_time: iso(START + LEG0_TICKS * 1000), stop_id: "wp-1", ended_by: "arrival" });
    expect(snap(s).crew.map((c) => [c.crew_id, c.activity, c.stop_index])).toEqual([["EV1", "AT_STOP", 1], ["EV2", "AT_STOP", 1]]);
    expect(snap(s).sim_time).toBe(iso(START + LEG0_TICKS * 1000));
  });

  it("the next press goes to the following stop, walking through the dwell", () => {
    const s = started();
    jump(s);
    const second = jump(s);
    expect(second.result.ok).toBe(true);
    expect(second.events.filter((e) => e.kind === "LEFT_STOP")).toHaveLength(2);
    expect(second.events.filter((e) => e.kind === "ARRIVED_STOP").map((e) => (e.data as { stop_id: string }).stop_id)).toEqual(["wp-2", "wp-2"]);
    expect(jumpedOf(second.events)).toMatchObject({ stop_id: "wp-2", ended_by: "arrival" });
  });

  it("every event raised on the way is logged at its own sim second, in order, before CLOCK_JUMPED", () => {
    const s = started();
    jump(s);
    const { events } = jump(s);
    const times = events.filter((e) => e.kind !== "CLOCK_JUMPED").map((e) => Date.parse(e.sim_time));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBeGreaterThan(1); // LEFT_STOP and ARRIVED_STOP are minutes apart
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => events[0].seq + i));
  });
});

describe("JUMP_NEXT_STOP: it is a fast-forward, not a teleport (02 §D.17; 01 FR-51)", () => {
  it("O2, both dose fields and position equal those of a run that ticks the same sim seconds one by one", () => {
    const jumped = started();
    const walked = started();
    const { events } = jump(jumped);
    const seconds = LEG0_TICKS;
    const ticked = walked.advance(seconds).events;
    for (const id of ["EV1", "EV2"] as const) {
      const a = snap(jumped).crew.find((c) => c.crew_id === id)!;
      const b = snap(walked).crew.find((c) => c.crew_id === id)!;
      expect({ x: a.x_m, y: a.y_m, o2: a.o2_frac, e: a.dose_event_ugy, u: a.dose_event_unsheltered_ugy, t: a.eva_elapsed_s }).toEqual({ x: b.x_m, y: b.y_m, o2: b.o2_frac, e: b.dose_event_ugy, u: b.dose_event_unsheltered_ugy, t: b.eva_elapsed_s });
      expect(a.o2_frac).toBeLessThan(1);
      expect(a.dose_event_ugy).toBeGreaterThan(0);
    }
    expect(events.filter((e) => e.kind !== "CLOCK_JUMPED").map(strip)).toEqual(ticked.map(strip));
    expect(snap(jumped).sim_time).toBe(snap(walked).sim_time);
  });

  it("the equivalence also holds through a dwell and into the second stop", () => {
    const jumped = started();
    const walked = started();
    jump(jumped);
    const second = jump(jumped);
    const seconds = Date.parse(snap(jumped).sim_time) / 1000 - START / 1000;
    walked.advance(seconds);
    expect(snap(jumped).crew).toEqual(snap(walked).crew);
    expect(second.events.length).toBeGreaterThan(0);
  });

  it("leaves the clock speed unchanged", () => {
    const s = started();
    expect(s.apply(cmd("ops", "SET_CLOCK", { speed: 60 }), "c-ops").result.ok).toBe(true);
    jump(s);
    expect(snap(s).session.clock).toMatchObject({ speed: 60, paused: false });
    expect(snap(s).session.status).toBe("RUNNING");
  });

  it("works while the clock is paused and leaves it paused", () => {
    const s = started();
    expect(s.apply(cmd("ops", "SET_CLOCK", { paused: true }), "c-ops").result.ok).toBe(true);
    const { result, events } = jump(s);
    expect(result.ok).toBe(true);
    expect(jumpedOf(events).ended_by).toBe("arrival");
    expect(snap(s).session.clock.paused).toBe(true);
    expect(snap(s).session.status).toBe("PAUSED");
  });
});

describe("JUMP_NEXT_STOP: end conditions, one case each (BD-92, BD-97)", () => {
  it("ended_by arrival", () => {
    expect(jumpedOf(jump(started()).events).ended_by).toBe("arrival");
  });

  it("ended_by alert: the first warning-level ALERT_RAISED ends the jump at its own second, before the next stop", () => {
    const s = started(shiftedStorm);
    jump(s); // stop 1 at LEG0_TICKS, before the storm's alert at tick 1200
    const { events } = jump(s);
    const raised = events.find((e) => e.kind === "ALERT_RAISED")!;
    expect(raised.data).toMatchObject({ code: "RADIATION_ALERT", level: "warning" });
    expect(jumpedOf(events)).toEqual({ reason: "next_stop", from_sim_time: iso(START + LEG0_TICKS * 1000), to_sim_time: raised.sim_time, stop_id: "wp-2", ended_by: "alert" });
    expect(events.filter((e) => e.kind === "ARRIVED_STOP")).toHaveLength(0);
    expect(raised.sim_time).toBe(iso(START + 1200_000));
  });

  it("an advisory or caution alert does not end the jump", () => {
    const s = started(quiet);
    expect(s.apply(cmd("ops", "INJECT_EVENT", { level: "caution", message: "Dust devil nearby" }), "c-ops").result.ok).toBe(true);
    expect(jumpedOf(jump(s).events).ended_by).toBe("arrival");
  });

  it("ended_by plan_revised", () => {
    const s = started(quiet);
    const at = iso(START + 100_000);
    hook.at = at;
    hook.event = {
      sim_time: at,
      kind: "PLAN_REVISED",
      actor: "system",
      data: { plan_revision: 2, option_id: null, stops_dropped: [], waypoints: plan.waypoints, legs: plan.result.legs },
      provenance: {},
    };
    const { events } = jump(s);
    expect(events.map((e) => e.kind)).toEqual(["PLAN_REVISED", "CLOCK_JUMPED"]);
    expect(jumpedOf(events)).toMatchObject({ to_sim_time: at, stop_id: "wp-1", ended_by: "plan_revised" });
  });

  it("ended_by eva_ended: the route ends before the target stop is reached", () => {
    const s = started(strayStop({ EV1: 0, EV2: 0 }));
    jump(s); // stop 1
    const { events } = jump(s); // target stop 2 is never visited; the crew walk home
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(["LEFT_STOP", "CREW_SHELTERED", "EVA_ENDED"]));
    expect(jumpedOf(events)).toMatchObject({ stop_id: "wp-2", ended_by: "eva_ended" });
    expect(snap(s).session.status).toBe("ENDED");
  });

  it("ended_by sheltered: the first crew member home ends the jump while the other is still out", () => {
    const s = started(strayStop({ EV1: 0, EV2: 600 }));
    jump(s); // both at stop 1 (the jump waits for the later one, EV2)
    const { events } = jump(s); // target stop 2 is never visited; EV1 walks home 600 s before EV2
    const sheltered = events.filter((e) => e.kind === "CREW_SHELTERED");
    expect(sheltered).toHaveLength(1);
    expect((sheltered[0].data as { crew_id: string }).crew_id).toBe("EV1");
    expect(jumpedOf(events)).toMatchObject({ stop_id: "wp-2", ended_by: "sheltered" });
    expect(snap(s).session.status).toBe("RUNNING");
    // The second press ends with the other crew member's return: eva_ended.
    expect(jumpedOf(jump(s).events).ended_by).toBe("eva_ended");
  });

  it("with several end conditions in one tick the warning-level alert is named first, then plan_revised, eva_ended, sheltered, arrival", () => {
    const e = (kind: LogEvent["kind"], data: Record<string, unknown> = {}): LogEvent => ({ seq: 1, sim_time: iso(START), kind, actor: "system", data, provenance: {}, command_ref: null });
    const warn = e("ALERT_RAISED", { level: "warning" });
    const note = e("ALERT_RAISED", { level: "caution" });
    expect(jumpEnded([e("CREW_SHELTERED"), e("EVA_ENDED"), e("PLAN_REVISED"), warn])).toBe("alert");
    expect(jumpEnded([e("CREW_SHELTERED"), e("EVA_ENDED"), e("PLAN_REVISED")])).toBe("plan_revised");
    expect(jumpEnded([e("CREW_SHELTERED"), e("EVA_ENDED")])).toBe("eva_ended");
    expect(jumpEnded([e("CREW_SHELTERED")])).toBe("sheltered");
    expect(jumpEnded([note, e("ARRIVED_STOP"), e("LEFT_STOP")])).toBeNull();
    expect(jumpEnded([])).toBeNull();
  });
});

describe("JUMP_NEXT_STOP: rejections (02 §D.17; 02 §E.4 role, args, state order)", () => {
  it("is INVALID with no EVA running (LOADED) and logs one COMMAND_REJECTED", () => {
    const s = loadSession(fake, varDir());
    const before = snap(s).seq;
    const r = jump(s);
    expect(rejectedCode(r)).toBe("INVALID");
    expect(r.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
    expect(snap(s).seq).toBe(before + 1);
  });

  it("is INVALID after the EVA ended", () => {
    const s = started(strayStop({ EV1: 0, EV2: 0 }));
    jump(s);
    jump(s); // eva_ended
    expect(rejectedCode(jump(s))).toBe("INVALID");
  });

  it("is INVALID when no stop is left, and leaves the state untouched", () => {
    const s = started(quiet);
    jump(s);
    jump(s); // at stop 2, the last stop
    expect(snap(s).next_stop_target).toBeNull();
    const before = snap(s);
    const r = jump(s);
    expect(rejectedCode(r)).toBe("INVALID");
    expect(snap(s).sim_time).toBe(before.sim_time);
    expect(snap(s).crew).toEqual(before.crew);
  });

  it("is INVALID, with nothing logged but the rejection, when no end condition is reached within the maximum EVA duration", () => {
    // One crew member never leaves the hab (offset beyond the bound) and the other is gone: the target cannot be reached.
    const limit = plan.scenario.max_eva_duration_h * 3600;
    const s = started(strayStop({ EV1: limit * 2, EV2: limit * 2 }));
    const before = snap(s);
    const r = jump(s);
    expect(rejectedCode(r)).toBe("INVALID");
    expect(r.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
    expect(snap(s).sim_time).toBe(before.sim_time);
    expect(snap(s).crew).toEqual(before.crew);
  });

  it("is BUSY while a warning-level alert is latched, even after it was acknowledged (U-63)", () => {
    const s = started(shiftedStorm);
    jump(s);
    jump(s); // alert
    expect(rejectedCode(jump(s))).toBe("BUSY");
    const alert = snap(s).alerts.find((a) => a.level === "warning")!;
    expect(s.apply(cmd("ops", "ACK_ALERT", { alert_id: alert.alert_id }), "c-ops").result.ok).toBe(true);
    expect(rejectedCode(jump(s))).toBe("BUSY");
  });

  it("is FORBIDDEN_ROLE, and logged, for every role but presenter", () => {
    const roles = Object.keys(PERMISSIONS) as Role[];
    for (const role of roles) {
      const s = started();
      const before = snap(s);
      const r = s.apply(cmd(role, "JUMP_NEXT_STOP"), `c-${role}`);
      if (role === "presenter") {
        expect(r.result.ok, role).toBe(true);
        continue;
      }
      expect(rejectedCode(r), role).toBe("FORBIDDEN_ROLE");
      expect(r.events.map((e) => e.kind)).toEqual(["COMMAND_REJECTED"]);
      expect(snap(s).sim_time).toBe(before.sim_time);
    }
  });

  it("a retry with the same command id returns the first result and logs nothing more", () => {
    const s = started();
    const c = cmd("presenter", "JUMP_NEXT_STOP");
    const first = s.apply(c, "c-presenter");
    const again = s.apply(c, "c-presenter");
    expect(again.events).toEqual([]);
    expect(again.result).toEqual(first.result);
  });
});

describe("nextStopTarget and Snapshot.next_stop_target (BD-104)", () => {
  it("is stop 1 before the walk starts and null with no stop left", () => {
    const state = initialState(fake, "s-0001");
    expect(nextStopTarget(state)).toEqual({ stop_id: "wp-1", stop_index: 1 });
  });

  it("is the lowest-index stop not reached by every crew member on EVA: the one still behind sets the target", () => {
    let state = initialState(fake, "s-0001");
    const at = (kind: LogEvent["kind"], data: Record<string, unknown>): void => {
      state = reduce(state, { seq: state.session.last_seq + 1, sim_time: iso(START), kind, actor: "system", data, provenance: {}, command_ref: null });
    };
    at("EVA_STARTED", { crew_ids: ["EV1", "EV2"], plan_revision: 1 });
    at("ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 });
    expect(nextStopTarget(state)).toEqual({ stop_id: "wp-1", stop_index: 1 }); // EV2 has not reached stop 1
    at("ARRIVED_STOP", { crew_id: "EV2", stop_id: "wp-1", stop_index: 1 });
    expect(nextStopTarget(state)).toEqual({ stop_id: "wp-2", stop_index: 2 });
    at("ARRIVED_STOP", { crew_id: "EV1", stop_id: "wp-2", stop_index: 2 });
    expect(nextStopTarget(state)).toEqual({ stop_id: "wp-2", stop_index: 2 });
    at("ARRIVED_STOP", { crew_id: "EV2", stop_id: "wp-2", stop_index: 2 });
    expect(nextStopTarget(state)).toBeNull();
  });

  it("a crew member sent to a haven no longer counts", () => {
    let state = initialState(fake, "s-0001");
    state = { ...state, session: { ...state.session, status: "RUNNING" }, crew: state.crew.map((c) => ({ ...c, activity: c.crew_id === "EV1" ? ("TO_HAVEN" as const) : ("AT_STOP" as const), stop_index: c.crew_id === "EV1" ? 0 : 1 })) };
    expect(nextStopTarget(state)).toEqual({ stop_id: "wp-2", stop_index: 2 });
  });

  it("is null with no plan", () => {
    const state = initialState(fake, "s-0001");
    expect(nextStopTarget({ ...state, plan: null })).toBeNull();
  });

  it("the snapshot's next_stop_target equals nextStopTarget of the engine state after every tick", () => {
    const s = started();
    const seen = new Set<string>();
    for (let i = 0; i < LEG0_TICKS + DWELL_S + 400; i++) {
      s.advance(1);
      const t = snap(s).next_stop_target;
      seen.add(JSON.stringify(t));
      const arrived = snap(s).crew.every((c) => (c.stop_index ?? 0) >= 1);
      expect(t, `tick ${i + 1}`).toEqual(arrived ? { stop_id: "wp-2", stop_index: 2 } : { stop_id: "wp-1", stop_index: 1 });
    }
    expect(seen.size).toBe(2);
  });

  it("is null in a plan-less session and with no stop left", () => {
    const s = loadSession({ ...fake, scenario: { ...fake.scenario, plan: undefined, stop_tasks: undefined } }, varDir());
    expect(snap(s).next_stop_target).toBeNull();
    const done = started(quiet);
    jump(done);
    jump(done);
    expect(snap(done).next_stop_target).toBeNull();
  });
});

describe("JUMP_NEXT_STOP: determinism and resume (NFR-06, NFR-10)", () => {
  const script = (dir: string, scenario: LoadedScenario): SessionHandle => {
    n = 0;
    const s = loadSession(scenario, dir);
    s.apply(cmd("ops", "START_EVA"), "c-ops");
    if (scenario === shiftedStorm) s.apply(cmd("presenter", "START_EVENT", { event_id: "storm" }), "c-presenter");
    s.apply(cmd("ops", "SET_CLOCK", { speed: 10 }), "c-ops");
    jump(s);
    jump(s);
    return s;
  };

  it("the same command list gives the same log_hash twice", () => {
    const a = snap(script(varDir(), shiftedStorm));
    const b = snap(script(varDir(), shiftedStorm));
    expect(a.session.log_hash).toBe(b.session.log_hash);
    expect(a.session.log_hash).not.toBe("");
    expect(b).toEqual(a);
  });

  it("a session resumed after a jump has the same state", () => {
    const dir = varDir();
    const live = snap(script(dir, quiet));
    const resumed = snap(resumeSession(join(dir, "sessions", "s-0001"), quiet));
    expect(resumed.session.log_hash).toBe(live.session.log_hash);
    expect(resumed.crew).toEqual(live.crew);
  });

  it("no tick event of a jump is dated outside [from_sim_time, to_sim_time]", () => {
    const s = started();
    const { events } = jump(s);
    const j = jumpedOf(events);
    for (const e of events.filter((x) => x.kind !== "CLOCK_JUMPED")) {
      expect(Date.parse(e.sim_time)).toBeGreaterThanOrEqual(Date.parse(j.from_sim_time));
      expect(Date.parse(e.sim_time)).toBeLessThanOrEqual(Date.parse(j.to_sim_time));
    }
  });
});
