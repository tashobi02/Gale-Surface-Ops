/**
 * T23.03 (backend package 05): haven per tick and HAVEN_TIME_EXCEEDED (docs/specs/02 §D.8 live form, §D.14; 01 FR-39;
 * 05 Crew `haven`; BD-57). Compute is the real @marswalk/compute with pass-through spies on the two field builders, so
 * the cache rule ("the hab field is computed once per grid, limits and candidate") is visible.
 *
 * The grid is the synthetic F9 `havenFlat` fixture (`packages/compute/tests/fixtures/v2grids.ts`) at 10 m, flat, with
 * the hab at the origin (the fake scenario's start waypoint), the rover 2 km west and the crew 1 km east by default.
 * Expected hab times are closed forms from the declared inputs: on flat ground along a row the walk is
 * distance / v0 (02 §D.2 with slope 0), plus the suit ParamSet's `hab_ingress_min`; nothing is typed in as a science
 * number. The vehicle cases use compute's own `liveHaven` as the oracle.
 *
 * Rules checked (Proposed 2026-11-12, backend package 05):
 * - Each tick, for a crew member on EVA (WALKING, AT_STOP, TO_HAVEN and not waiting out `start_offset_s`):
 *   `haven.minutes` = live haven seconds / 60, `kind` and `target_*` from compute `liveHaven`; unreachable gives
 *   minutes Infinity, kind `hab`, target the hab. A crew member IN_HAB, SHELTERED or waiting has minutes 0.
 * - HAVEN_TIME_EXCEEDED: a `caution`, subject the crew member, raised once when minutes exceed the plan's
 *   `max_haven_min` and cleared when back at or under it (or when the crew member is no longer out).
 * - No grid, or no plan: nothing changes and nothing is raised.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crewTimeField, habIngressS, habTimeField, liveHaven, vehiclePassable, vehicleTimeField, type LoadedGrid } from "@marswalk/compute";
import type { CrewId, LogEventData } from "@marswalk/protocol";
import * as havenModule from "../src/engine/haven";
import { HavenCache, havenTick } from "../src/engine/haven";
import { initialState, logged, reduce, type EngineState, type PendingEvent } from "../src/engine/reducer";
import type { TickContext, TickResult } from "../src/engine/tick";
import { loadSession } from "../src/session";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { fixtureCellCentre, fixtureCellIndex, havenFlat } from "../../../packages/compute/tests/fixtures/v2grids";

const spies = vi.hoisted(() => ({ hab: 0, crew: 0, vehicle: 0 }));
vi.mock("@marswalk/compute", async () => {
  const actual = await vi.importActual<typeof import("@marswalk/compute")>("@marswalk/compute");
  return {
    ...actual,
    habTimeField: (...args: Parameters<typeof actual.habTimeField>) => {
      spies.hab++;
      return actual.habTimeField(...args);
    },
    crewTimeField: (...args: Parameters<typeof actual.crewTimeField>) => {
      spies.crew++;
      return actual.crewTimeField(...args);
    },
    vehicleTimeField: (...args: Parameters<typeof actual.vehicleTimeField>) => {
      spies.vehicle++;
      return actual.vehicleTimeField(...args);
    },
  };
});
/** The per-session memo (BD-145, BD-146): each test starts with a fresh one, as each session does. */
let cache = new HavenCache();
beforeEach(() => {
  spies.hab = spies.crew = spies.vehicle = 0;
  cache = new HavenCache();
});

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const fx = havenFlat(10);
const sc: LoadedScenario = { ...fake, grid: fx.grid };
const plan = sc.scenario.plan!;
const mission = plan.scenario;
const suit = sc.params["suit-assumed"]!;
const rover = sc.params["pr1-assumed"]!;
const v0 = (mission.suited_flat_speed_kmh * 1000) / 3600;
const ingress = { hab_s: habIngressS(suit), vehicle_s: Number(rover.values.ingress_min) * 60 };

const ctxOf = (scenario: LoadedScenario = sc, next_seq = 1): TickContext => ({ scenario, dt_s: 1, next_seq, haven_cache: cache });

/** An EVA state: crew WALKING at the given x (y = 0), no vehicle unless `vehicle` gives its x, PARKED. */
function evaState(positions: Partial<Record<CrewId, number>>, vehicle: number | null = null, scenario: LoadedScenario = sc): EngineState {
  const s = initialState(scenario, "s-0001");
  return {
    ...s,
    session: { ...s.session, status: "RUNNING" },
    crew: s.crew.map((c) => (positions[c.crew_id] === undefined ? c : { ...c, activity: "WALKING" as const, x_m: positions[c.crew_id]!, y_m: 0 })),
    vehicles: vehicle === null ? [] : s.vehicles.map((v) => ({ ...v, x_m: vehicle, y_m: 0, state: "PARKED" as const })),
  };
}

/** What tick.ts does with a module's result: reduce its events with consecutive seqs. */
function applied(state: EngineState, r: TickResult, first_seq = 1): EngineState {
  return r.events.reduce((s, e, i) => reduce(s, logged(e, first_seq + i)), r.state);
}
const crewOf = (s: EngineState, id: CrewId) => s.crew.find((c) => c.crew_id === id)!;
const raised = (events: PendingEvent[]) => events.filter((e) => e.kind === "ALERT_RAISED");

describe("haven per tick (FR-39, 02 §D.8 live form)", () => {
  it("no vehicle: minutes = walk to the hab / v0 + the suit ParamSet's hab ingress, kind hab, target the hab", () => {
    const state = evaState({ EV1: 600 });
    const out = havenTick(state, ctxOf()).state;
    const h = crewOf(out, "EV1").haven;
    expect(h.minutes).toBeCloseTo((600 / v0 + habIngressS(suit)) / 60, 6);
    expect(h.kind).toBe("hab");
    expect([h.target_x_m, h.target_y_m]).toEqual([fx.shape.hab.x_m, fx.shape.hab.y_m]);
  });

  it("each crew member gets their own haven from their own position", () => {
    const out = havenTick(evaState({ EV1: 300, EV2: 900 }), ctxOf()).state;
    expect(crewOf(out, "EV1").haven.minutes).toBeCloseTo((300 / v0 + ingress.hab_s) / 60, 6);
    expect(crewOf(out, "EV2").haven.minutes).toBeCloseTo((900 / v0 + ingress.hab_s) / 60, 6);
  });

  it("a parked rover gives the vehicle branch when it is quicker: kind vehicle, the numbers of compute's liveHaven", () => {
    const state = evaState({ EV1: 1000 }, -2000);
    const out = havenTick(state, ctxOf()).state;
    const limit_s = mission.max_haven_min * 60;
    const habField = habTimeField(fx.grid, fx.shape.hab, mission);
    const expected = liveHaven(
      habField,
      crewTimeField(fx.grid, { x_m: 1000, y_m: 0 }, mission, limit_s),
      vehicleTimeField(fx.grid, { x_m: -2000, y_m: 0 }, rover),
      vehiclePassable(fx.grid, rover),
      ingress,
      { x_m: 1000, y_m: 0 },
    )!;
    const h = crewOf(out, "EV1").haven;
    expect(h.minutes).toBeCloseTo(expected.haven_s / 60, 9);
    expect(h.kind).toBe(expected.kind);
    expect([h.target_x_m, h.target_y_m]).toEqual([expected.target_x_m, expected.target_y_m]);
  });

  it("a rover that is not PARKED (or a plan without vehicle_available) gives no vehicle branch", () => {
    const moving = evaState({ EV1: 1000 }, -2000);
    const en_route: EngineState = { ...moving, vehicles: moving.vehicles.map((v) => ({ ...v, state: "EN_ROUTE" as const })) };
    expect(crewOf(havenTick(en_route, ctxOf()).state, "EV1").haven.kind).toBe("hab");
    const off: EngineState = { ...moving, plan: { ...plan, scenario: { ...mission, vehicle_available: false } } };
    expect(crewOf(havenTick(off, ctxOf()).state, "EV1").haven.kind).toBe("hab");
  });

  it("an unreachable haven (crew off the grid) is minutes Infinity, kind hab, target the hab", () => {
    const out = havenTick(evaState({ EV1: 1e6 }), ctxOf()).state;
    const h = crewOf(out, "EV1").haven;
    expect(h.minutes).toBe(Infinity);
    expect(h.kind).toBe("hab");
    expect([h.target_x_m, h.target_y_m]).toEqual([fx.shape.hab.x_m, fx.shape.hab.y_m]);
  });

  it("a crew member in the hab, sheltered, or still waiting out start_offset_s has haven minutes 0 and no field is built for them", () => {
    const base = evaState({ EV1: 600 });
    const state: EngineState = { ...base, crew: base.crew.map((c) => (c.crew_id === "EV2" ? { ...c, activity: "SHELTERED" as const, haven: { ...c.haven, minutes: 12 } } : c)) };
    const out = havenTick(state, ctxOf()).state;
    expect(crewOf(out, "EV2").haven.minutes).toBe(0);
    const inHab = havenTick(evaState({}), ctxOf());
    expect(inHab.state.crew.every((c) => c.haven.minutes === 0)).toBe(true);
    expect(spies.crew + spies.vehicle).toBe(0);
    const waiting = { ...sc, scenario: { ...sc.scenario, crew: sc.scenario.crew.map((c) => (c.crew_id === "EV1" ? { ...c, start_offset_s: 300 } : c)) } };
    const w = havenTick(evaState({ EV1: 0 }, null, waiting), ctxOf(waiting)).state;
    expect(crewOf(w, "EV1").haven.minutes).toBe(0);
  });

  it("reports a STATE_DELTA for each changed haven and none when nothing changed", () => {
    const first = havenTick(evaState({ EV1: 600 }), ctxOf());
    expect(first.deltas.map((d) => d.path)).toEqual(["crew/EV1/haven"]);
    expect(first.deltas[0]!.value).toEqual(crewOf(first.state, "EV1").haven);
    expect(havenTick(first.state, ctxOf()).deltas).toEqual([]);
  });

  it("with no grid or no plan nothing changes", () => {
    const state = evaState({ EV1: 600 });
    const noGrid = havenTick(state, ctxOf({ ...sc, grid: null }));
    expect(noGrid).toEqual({ state, events: [], deltas: [] });
    const noPlan = havenTick({ ...state, plan: null }, ctxOf({ ...sc, scenario: { ...sc.scenario, plan: undefined } }));
    expect(noPlan.events).toEqual([]);
    expect(noPlan.deltas).toEqual([]);
  });

  it("a scenario whose suit ParamSet lacks hab_ingress_min is an error naming the key, never a default", () => {
    const { hab_ingress_min: _gone, ...values } = suit.values;
    const broken: LoadedScenario = { ...sc, params: { ...sc.params, "suit-assumed": { ...suit, values } } };
    expect(() => havenTick(evaState({ EV1: 600 }), ctxOf(broken))).toThrow(/hab_ingress_min/);
  });

  it("the haven values of the same state are identical on every call (NFR-06)", () => {
    const a = havenTick(evaState({ EV1: 600, EV2: 900 }, -2000), ctxOf());
    cache.clear();
    const b = havenTick(evaState({ EV1: 600, EV2: 900 }, -2000), ctxOf());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe("the hab field is computed once per grid, limits and candidate, and reused", () => {
  const tickTwice = (a: EngineState, b: EngineState = a, scenario: LoadedScenario = sc): number => {
    spies.hab = 0;
    havenTick(a, ctxOf(scenario));
    havenTick(b, ctxOf(scenario));
    return spies.hab;
  };

  it("two ticks and two crew members build one hab field", () => {
    expect(tickTwice(evaState({ EV1: 600, EV2: 900 }))).toBe(1);
  });

  it("a crew member moving does not rebuild it", () => {
    expect(tickTwice(evaState({ EV1: 600 }), evaState({ EV1: 650 }))).toBe(1);
  });

  it("a change of hard_slope_limit_deg or max_haven_min rebuilds it", () => {
    const base = evaState({ EV1: 600 });
    const withMission = (patch: Partial<typeof mission>): EngineState => ({ ...base, plan: { ...plan, scenario: { ...mission, ...patch } } });
    expect(tickTwice(base, withMission({ hard_slope_limit_deg: mission.hard_slope_limit_deg - 1 }))).toBe(2);
    expect(tickTwice(base, withMission({ max_haven_min: mission.max_haven_min + 5 }))).toBe(2);
  });

  it("a change of hab candidate rebuilds it", () => {
    const base = evaState({ EV1: 600 });
    const other: EngineState = { ...base, session: { ...base.session, hab_candidate_id: "hab-alternative" } };
    expect(tickTwice(base, other)).toBe(2);
  });

  it("another grid rebuilds it, and cache.clear() forces a rebuild", () => {
    const base = evaState({ EV1: 600 });
    havenTick(base, ctxOf());
    spies.hab = 0;
    const copy: LoadedGrid = { ...fx.grid };
    havenTick(base, ctxOf({ ...sc, grid: copy }));
    expect(spies.hab).toBe(1);
    spies.hab = 0;
    cache.clear();
    havenTick(base, ctxOf({ ...sc, grid: copy }));
    expect(spies.hab).toBe(1);
  });

  it("the rover's field is rebuilt only when the rover or its ParamSet changes", () => {
    const state = evaState({ EV1: 1000 }, -2000);
    havenTick(state, ctxOf());
    havenTick(state, ctxOf());
    expect(spies.vehicle).toBe(1);
    const moved: EngineState = { ...state, vehicles: state.vehicles.map((v) => ({ ...v, x_m: -1900 })) };
    havenTick(moved, ctxOf());
    expect(spies.vehicle).toBe(2);
  });
});

describe("the live haven is computed once per crew cell (replay speed on the real 5 m grid; BD-145)", () => {
  const cell = fx.grid.meta.cell_m;
  /** The centre of the cell that holds x = 603, so a quarter-cell step stays inside it. */
  const X0 = fixtureCellCentre(fx.grid.meta, fixtureCellIndex(fx.grid.meta, { x_m: 603, y_m: 0 })!).x_m;
  const state = (x: number): EngineState => evaState({ EV1: x }, -2000);

  it("a crew member who stays inside one cell does not rebuild the crew field", () => {
    havenTick(state(X0), ctxOf());
    expect(spies.crew).toBe(1);
    havenTick(state(X0 + cell / 4), ctxOf());
    havenTick(state(X0), ctxOf());
    expect(spies.crew).toBe(1);
  });

  it("moving to another cell rebuilds it once", () => {
    havenTick(state(X0), ctxOf());
    havenTick(state(X0 + 2 * cell), ctxOf());
    havenTick(state(X0 + 2 * cell), ctxOf());
    expect(spies.crew).toBe(2);
  });

  it("two crew members each keep their own entry", () => {
    const two = evaState({ EV1: 600, EV2: 900 }, -2000);
    havenTick(two, ctxOf());
    havenTick(two, ctxOf());
    expect(spies.crew).toBe(2);
  });

  it("the cached result equals a cold computation at the same place, in the same cell and in the next one", () => {
    for (const x of [X0, X0 + cell / 4, X0 + 2 * cell]) {
      const warm = havenTick(state(x), ctxOf()).state.crew.find((c) => c.crew_id === "EV1")!.haven;
      cache.clear();
      const cold = havenTick(state(x), ctxOf()).state.crew.find((c) => c.crew_id === "EV1")!.haven;
      expect(warm).toEqual(cold);
    }
  });

  it("a change of the rover, the plan limits or cache.clear() recomputes", () => {
    havenTick(state(X0), ctxOf());
    const moved: EngineState = { ...state(X0), vehicles: state(X0).vehicles.map((v) => ({ ...v, x_m: -1900 })) };
    havenTick(moved, ctxOf());
    expect(spies.crew).toBe(2);
    cache.clear();
    havenTick(moved, ctxOf());
    expect(spies.crew).toBe(3);
  });
});

describe("the memo belongs to one session, not to the module (NFR-06; BD-146)", () => {
  const two = evaState({ EV1: 600, EV2: 900 }, -2000);
  const withCache = (c: HavenCache | undefined): TickContext => ({ scenario: sc, dt_s: 1, next_seq: 1, ...(c === undefined ? {} : { haven_cache: c }) });

  it("the module exports no process-wide cache control", () => {
    // currentHabField (N-100) takes the session's cache as an argument: it is a reader, not a process-wide control
    expect(Object.keys(havenModule).sort()).toEqual(["HavenCache", "currentHabField", "havenTick"]);
  });

  it("two caches do not share entries: each builds its own hab, rover and crew fields", () => {
    const a = new HavenCache();
    const b = new HavenCache();
    havenTick(two, withCache(a));
    expect([spies.hab, spies.vehicle, spies.crew]).toEqual([1, 1, 2]);
    havenTick(two, withCache(b));
    expect([spies.hab, spies.vehicle, spies.crew]).toEqual([2, 2, 4]);
    havenTick(two, withCache(a)); // its own entries are still there
    havenTick(two, withCache(b));
    expect([spies.hab, spies.vehicle, spies.crew]).toEqual([2, 2, 4]);
  });

  it("a context without a cache memoises nothing between calls, and still gives the same haven", () => {
    const first = havenTick(two, withCache(undefined));
    const second = havenTick(two, withCache(undefined));
    expect(spies.hab).toBe(2);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(first)).toBe(JSON.stringify(havenTick(two, withCache(new HavenCache()))));
  });

  it("clear() empties one cache and leaves the other alone", () => {
    const a = new HavenCache();
    const b = new HavenCache();
    havenTick(two, withCache(a));
    havenTick(two, withCache(b));
    a.clear();
    spies.hab = 0;
    havenTick(two, withCache(a));
    havenTick(two, withCache(b));
    expect(spies.hab).toBe(1);
  });

  it("two sessions on the same scenario object do not share the memo", () => {
    const dirA = mkdtempSync(join(tmpdir(), "havenTick-a-"));
    const dirB = mkdtempSync(join(tmpdir(), "havenTick-b-"));
    try {
      const run = (dir: string): number => {
        const session = loadSession(sc, dir);
        const before = spies.hab;
        expect(session.apply({ command_id: "c-1", role: "ops", kind: "START_EVA", args: {} }, "c-ops").result.ok).toBe(true);
        session.advance(5);
        return spies.hab - before;
      };
      const a = run(dirA);
      expect(a).toBeGreaterThan(0); // the crew were out, so the haven was evaluated
      expect(run(dirB)).toBe(a); // the second session builds as many as the first: nothing came from the first
    } finally {
      rmSync(dirA, { recursive: true, force: true });
      rmSync(dirB, { recursive: true, force: true });
    }
  });
});

describe("HAVEN_TIME_EXCEEDED (02 §D.8, 05 Alert)", () => {
  const limit_s = mission.max_haven_min * 60;
  // Walks of the declared flat form that bracket the plan's limit: just over and well under max_haven_min.
  const farX = -Math.ceil((limit_s - ingress.hab_s + 120) * v0);
  const nearX = -Math.floor((limit_s - ingress.hab_s - 300) * v0);

  it("is raised once when haven minutes exceed max_haven_min, as a caution for that crew member, with labelled data", () => {
    const r = havenTick(evaState({ EV1: farX, EV2: nearX }), ctxOf());
    expect(crewOf(r.state, "EV1").haven.minutes).toBeGreaterThan(mission.max_haven_min);
    expect(crewOf(r.state, "EV2").haven.minutes).toBeLessThan(mission.max_haven_min);
    const [e] = raised(r.events);
    expect(raised(r.events)).toHaveLength(1);
    const d = e!.data as LogEventData["ALERT_RAISED"] & Record<string, unknown>;
    expect(d).toMatchObject({ alert_id: "a-1", code: "HAVEN_TIME_EXCEEDED", level: "caution", subjects: ["EV1"], haven_kind: "hab" });
    expect(d.haven_min).toBeCloseTo(crewOf(r.state, "EV1").haven.minutes, 9);
    expect(d.message.length).toBeLessThanOrEqual(60);
    expect(e!.actor).toBe("system");
    expect(e!.provenance).toEqual({ "data.haven_min": "modelled" });
  });

  it("is not raised again while the crew member stays over the limit", () => {
    const first = havenTick(evaState({ EV1: farX }), ctxOf());
    const state = applied(evaState({ EV1: farX }), first);
    expect(state.alerts.map((a) => a.code)).toEqual(["HAVEN_TIME_EXCEEDED"]);
    const second = havenTick(state, ctxOf(sc, 2));
    expect(second.events).toEqual([]);
  });

  it("is cleared once the haven is back at or under max_haven_min", () => {
    const over = applied(evaState({ EV1: farX }), havenTick(evaState({ EV1: farX }), ctxOf()));
    const back: EngineState = { ...over, crew: over.crew.map((c) => (c.crew_id === "EV1" ? { ...c, x_m: nearX } : c)) };
    const r = havenTick(back, ctxOf(sc, 2));
    expect(r.events.map((e) => [e.kind, (e.data as { alert_id: string }).alert_id])).toEqual([["ALERT_CLEARED", "a-1"]]);
    expect(applied(back, r, 2).alerts.find((a) => a.alert_id === "a-1")!.cleared_seq).toBe(2);
  });

  it("raises again after it was cleared and the crew member goes over once more", () => {
    const over = applied(evaState({ EV1: farX }), havenTick(evaState({ EV1: farX }), ctxOf()));
    const near: EngineState = { ...over, crew: over.crew.map((c) => (c.crew_id === "EV1" ? { ...c, x_m: nearX } : c)) };
    const cleared = applied(near, havenTick(near, ctxOf(sc, 2)), 2);
    const far: EngineState = { ...cleared, crew: cleared.crew.map((c) => (c.crew_id === "EV1" ? { ...c, x_m: farX } : c)) };
    const r = havenTick(far, ctxOf(sc, 3));
    expect(raised(r.events).map((e) => (e.data as { alert_id: string }).alert_id)).toEqual(["a-3"]);
  });

  it("a haven exactly at max_haven_min is not exceeded; a limit just below it is", () => {
    const state = evaState({ EV1: farX });
    const minutes = crewOf(havenTick(state, ctxOf()).state, "EV1").haven.minutes;
    const limited = (max_haven_min: number): EngineState => ({ ...state, plan: { ...plan, scenario: { ...mission, max_haven_min } } });
    expect(raised(havenTick(limited(minutes), ctxOf()).events)).toHaveLength(0);
    expect(raised(havenTick(limited(minutes - 0.01), ctxOf()).events)).toHaveLength(1);
  });

  it("an unreachable haven raises it with haven_min null", () => {
    const r = havenTick(evaState({ EV1: 1e6 }), ctxOf());
    const [e] = raised(r.events);
    expect((e!.data as Record<string, unknown>).haven_min).toBeNull();
  });

  it("is cleared when the crew member is no longer out (sheltered)", () => {
    const over = applied(evaState({ EV1: farX }), havenTick(evaState({ EV1: farX }), ctxOf()));
    const sheltered: EngineState = { ...over, crew: over.crew.map((c) => (c.crew_id === "EV1" ? { ...c, activity: "SHELTERED" as const } : c)) };
    const r = havenTick(sheltered, ctxOf(sc, 2));
    expect(r.events.map((e) => e.kind)).toEqual(["ALERT_CLEARED"]);
  });
});

describe("haven in the session (provenance, tick cost)", () => {
  it("the snapshot labels crew.haven.minutes modelled (02 §E.6)", () => {
    const dir = join(process.env.TMPDIR ?? "/tmp", `havenTick-${process.pid}`);
    const session = loadSession(sc, dir);
    expect(session.snapshot([]).provenance["crew.haven.minutes"]).toBe("modelled");
  });

  it("a tick on the 10 m fake-scenario grid, cold and warm, stays within the NFR-02 target of 2 s", () => {
    // Timed here, never in the engine (NFR-06).
    const state = evaState({ EV1: 600, EV2: 900 }, -2000);
    const t0 = performance.now();
    havenTick(state, ctxOf());
    const cold = performance.now() - t0;
    const t1 = performance.now();
    havenTick(state, ctxOf());
    const warm = performance.now() - t1;
    expect(cold).toBeLessThan(2000);
    expect(warm).toBeLessThan(2000);
  });
});
