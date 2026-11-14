/**
 * T26.06 (backend package 17): the surface link graph per tick, LINK_LOST / LINK_RESTORED and COMM_SHADOW
 * (docs/specs/02 §D.11, §A.5 L-surf; 03 §E.10; 01 FR-42; 05 LinkState, Crew; backend decisions BD-103, BD-130).
 *
 * The grid is the synthetic F9 `losFlatWall` fixture (`packages/compute/tests/fixtures/v2grids.ts`: 5 m cells, mast 10 m
 * at the origin, suit antenna 2 m, a 20 m wall at x = 500) with the wall shortened to |y| <= WALL_HALF_LEN_M so that a
 * relay beside it can see both sides (a full-height wall shadows everything behind it from any point on the hab's side).
 * The static `comm_hab` layer is built here with compute's own `lineOfSight` (the same oracle the engine uses), and
 * every expectation is derived from compute or from the fixture's declared shape: nothing is typed in as a science number.
 *
 * Rules checked (Proposed 2026-11-12, backend package 17, BD-130):
 * - Nodes: the hab mast, every crew member on EVA (WALKING, AT_STOP, TO_HAVEN, not waiting out `start_offset_s`) and every
 *   utility rover parked as a relay (state ARRIVED, task RELAY). Crew in the hab or sheltered are linked.
 * - A crew member is linked when `linkStates` finds a path to HAB; LINK_LOST / LINK_RESTORED once per change, `node_id`
 *   the crew id; the reducer then sets `linked` / `stale`.
 * - `link_path`, `link_hops` and `link_via` (BD-103: direct | relay | crew | null), `last_linked_sim_time` (N-03).
 * - COMM_SHADOW: a `caution` alert per crew member while a stretch of the remaining route has neither `comm_hab` nor a
 *   linked relay's viewshed; cleared when none is left. No grid or no comm layer: the module changes nothing.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CrewId, LogEventData, OkLeg, ParamSet, Vehicle } from "@marswalk/protocol";
import { legSeconds } from "../src/engine/crewMargins";
import { linksTick } from "../src/engine/links";
import { initialState, logged, reduce, type CrewMotion, type EngineState, type PendingEvent } from "../src/engine/reducer";
import type { TickContext, TickResult } from "../src/engine/tick";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { commLayer, partialWall } from "./fixtures/wallWorld";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const ur1 = JSON.parse(readFileSync(join(here, "../../../scenarios/storm-sol4190/param_sets/ur1-assumed.json"), "utf8")) as ParamSet;

const fx = partialWall();
const mast = fx.shape.mast;
const suitAntenna = fx.shape.targetHeight_m;
const comm = { comm_hab: commLayer(fx.grid, mast, suitAntenna), hab_mast: mast };
const sc: LoadedScenario = { ...fake, grid: fx.grid, comm, params: { ...fake.params, [ur1.param_set_id]: ur1 } };
const CELL = fx.grid.meta.cell_m;
const FIRST_SHADOW_X = fx.shape.firstShadowX_m;

const T0 = Date.parse(sc.scenario.start_utc);
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

/** The fake plan's route shortened to 0 → 1000 → 0 (all inside the grid, which ends at x = 1500). */
const leg0 = sc.scenario.plan!.result.legs[0] as OkLeg;
const shortPlan = (to_x: number): NonNullable<EngineState["plan"]> => {
  const plan = sc.scenario.plan!;
  const out = { ...leg0, to: "wp-1", distance_m: to_x, walk_time_min: leg0.walk_time_min * (to_x / 1000), geometry: [[0, 0], [to_x, 0]] as [number, number][] };
  const back = { ...out, from: "wp-1", to: "wp-0", geometry: [[to_x, 0], [0, 0]] as [number, number][] };
  return { ...plan, waypoints: [plan.waypoints[0], { id: "wp-1", role: "stop", x_m: to_x, y_m: 0 }], result: { ...plan.result, legs: [out, back] } } as NonNullable<EngineState["plan"]>;
};

const walk = (leg_index = 0, t_s = 0): CrewMotion => ({ plan_revision: 1, phase: "walk", leg_index, t_s, last_wp_id: "wp-0" });

/** An EVA state: the listed crew are WALKING at their position (y given) with a motion record on leg 0. */
function evaState(pos: Partial<Record<CrewId, [number, number]>>, plan = shortPlan(1000), vehicles: Vehicle[] = [], at_ms = T0): EngineState {
  const s = initialState(sc, "s-0001");
  return {
    ...s,
    session: { ...s.session, status: "RUNNING", clock: { ...s.session.clock, sim_time: iso(at_ms) } },
    plan,
    crew: s.crew.map((c) => (pos[c.crew_id] ? { ...c, activity: "WALKING" as const, x_m: pos[c.crew_id]![0], y_m: pos[c.crew_id]![1] } : c)),
    motion: Object.fromEntries(Object.keys(pos).map((id) => [id, walk()])) as EngineState["motion"],
    vehicles: [...s.vehicles, ...vehicles],
  };
}

const relay = (x_m: number, y_m: number, patch: Partial<Vehicle> = {}): Vehicle => ({
  vehicle_id: "UR1",
  kind: "utility_rover",
  param_set: ur1.param_set_id,
  x_m,
  y_m,
  state: "ARRIVED",
  task: { kind: "RELAY", target: { x_m, y_m } },
  path: [],
  eta_s: 0,
  battery_wh: 4000,
  ...patch,
});

const ctxOf = (s: EngineState, scenario: LoadedScenario = sc): TickContext => ({ scenario, dt_s: 1, next_seq: s.session.last_seq + 1 });

/** What tick.ts does with a module's result: reduce its events with consecutive seqs from `ctx.next_seq`. */
function applied(s: EngineState, r: TickResult): EngineState {
  return r.events.reduce((acc, e, i) => reduce(acc, logged(e, s.session.last_seq + 1 + i)), r.state);
}
const crewOf = (s: EngineState, id: CrewId) => s.crew.find((c) => c.crew_id === id)!;
const links = (events: PendingEvent[]) => events.filter((e) => e.kind === "LINK_LOST" || e.kind === "LINK_RESTORED");
const shadows = (events: PendingEvent[]) => events.filter((e) => e.kind === "ALERT_RAISED" && (e.data as LogEventData["ALERT_RAISED"]).code === "COMM_SHADOW");

/** Move EV1 to x and run one tick at sim second `k`, applying the events. */
function stepTo(s: EngineState, id: CrewId, x: number, k: number): { state: EngineState; result: TickResult } {
  const moved: EngineState = {
    ...s,
    session: { ...s.session, clock: { ...s.session.clock, sim_time: iso(T0 + k * 1000) } },
    crew: s.crew.map((c) => (c.crew_id === id ? { ...c, x_m: x } : c)),
  };
  const result = linksTick(moved, ctxOf(moved));
  return { state: applied(moved, result), result };
}

describe("fixture sanity (the oracle the tests lean on)", () => {
  it("the first shadowed column behind the wall is the fixture's declared one, and the comm layer agrees", () => {
    const at = (x: number): number => comm.comm_hab[Math.floor((fx.grid.meta.origin_m[1] - 0) / CELL) * fx.grid.meta.width + Math.floor((x - fx.grid.meta.origin_m[0]) / CELL)];
    expect(at(FIRST_SHADOW_X - CELL)).toBe(1);
    expect(at(FIRST_SHADOW_X)).toBe(0);
  });
});

describe("link graph per tick (FR-42, 02 §D.11)", () => {
  it("a crew member walking behind the wall loses the link once and regains it once, with the crew id as node_id", () => {
    let s = evaState({ EV1: [100, 0] });
    const seen: { kind: string; node: string; x: number }[] = [];
    let k = 0;
    const route = [...range(100, 700, 5), ...range(700, 100, -5)];
    for (const x of route) {
      const r = stepTo(s, "EV1", x, ++k);
      for (const e of links(r.result.events)) seen.push({ kind: e.kind, node: (e.data as LogEventData["LINK_LOST"]).node_id, x });
      s = r.state;
    }
    expect(seen).toEqual([
      { kind: "LINK_LOST", node: "EV1", x: FIRST_SHADOW_X },
      { kind: "LINK_RESTORED", node: "EV1", x: FIRST_SHADOW_X - CELL },
    ]);
    expect(crewOf(s, "EV1").linked).toBe(true);
  });

  it("while unlinked the crew member is stale, has no path or hops, and keeps the last time it was linked", () => {
    let s = evaState({ EV1: [100, 0] });
    s = stepTo(s, "EV1", FIRST_SHADOW_X - CELL, 1).state;
    expect(crewOf(s, "EV1").last_linked_sim_time).toBe(iso(T0 + 1000));
    s = stepTo(s, "EV1", FIRST_SHADOW_X, 2).state;
    s = stepTo(s, "EV1", FIRST_SHADOW_X + 100, 3).state;
    const ev1 = crewOf(s, "EV1");
    expect(ev1).toMatchObject({ linked: false, stale: true, link_path: [], link_hops: null, link_via: null });
    expect(ev1.last_linked_sim_time).toBe(iso(T0 + 1000));
    // Back in coverage: restored, fresh, and the time moves again.
    s = stepTo(s, "EV1", FIRST_SHADOW_X - CELL, 9).state;
    expect(crewOf(s, "EV1")).toMatchObject({ linked: true, stale: false, last_linked_sim_time: iso(T0 + 9000) });
  });

  it("a direct link to the hab is one hop, via direct (BD-103)", () => {
    const out = linksTick(evaState({ EV1: [300, 0] }), ctxOf(evaState({ EV1: [300, 0] }))).state;
    expect(crewOf(out, "EV1")).toMatchObject({ link_path: ["EV1", "HAB"], link_hops: 1, link_via: "direct" });
    expect(crewOf(out, "EV1")).not.toHaveProperty("quality_bars");
  });

  it("behind the wall but in view of a buddy who is linked: two hops, via crew", () => {
    const s = evaState({ EV1: [700, 0], EV2: [600, 150] });
    const out = applied(s, linksTick(s, ctxOf(s)));
    expect(crewOf(out, "EV1")).toMatchObject({ linked: true, link_path: ["EV1", "EV2", "HAB"], link_hops: 2, link_via: "crew" });
    expect(crewOf(out, "EV2")).toMatchObject({ link_path: ["EV2", "HAB"], link_hops: 1, link_via: "direct" });
  });

  it("a parked relay rover beside the wall links the crew member behind it: two hops, via relay", () => {
    const s = evaState({ EV1: [700, 0] }, shortPlan(1000), [relay(800, 200)]);
    const out = applied(s, linksTick(s, ctxOf(s)));
    expect(crewOf(out, "EV1")).toMatchObject({ linked: true, link_path: ["EV1", "UR1", "HAB"], link_hops: 2, link_via: "relay" });
    expect(out.links.find((l) => l.node_id === "UR1")).toMatchObject({ linked_to_hab: true });
  });

  it("a rover that is not parked as a relay is no node (moving, or another task), and a relay that is itself cut off relays nothing", () => {
    for (const v of [relay(800, 200, { state: "EN_ROUTE" }), relay(800, 200, { task: { kind: "SCOUT", target: { x_m: 800, y_m: 200 } } }), relay(800, 0)]) {
      const s = evaState({ EV1: [700, 0] }, shortPlan(1000), [v]);
      const out = applied(s, linksTick(s, ctxOf(s)));
      expect(crewOf(out, "EV1").linked).toBe(false);
    }
  });

  it("a relay without a ParamSet antenna height is a scenario error that names the key (no default in code)", () => {
    const broken: LoadedScenario = { ...sc, params: { ...sc.params, [ur1.param_set_id]: { ...ur1, values: { flat_speed_kmh: 2 } } as ParamSet } };
    const s = evaState({ EV1: [700, 0] }, shortPlan(1000), [relay(800, 200)]);
    expect(() => linksTick(s, ctxOf(s, broken))).toThrow(/antenna_m/);
  });

  it("choosing another hab candidate changes the coverage: the mast and comm layer of the scenario in use decide", () => {
    const east = { x_m: 900, y_m: 0, height_m: mast.height_m };
    const other: LoadedScenario = { ...sc, comm: { comm_hab: commLayer(fx.grid, east, suitAntenna), hab_mast: east } };
    const s = evaState({ EV1: [700, 0] });
    expect(crewOf(applied(s, linksTick(s, ctxOf(s))), "EV1").linked).toBe(false);
    const out = applied(s, linksTick(s, ctxOf(s, other)));
    expect(crewOf(out, "EV1")).toMatchObject({ linked: true, link_path: ["EV1", "HAB"] });
  });

  it("crew in the hab or sheltered are linked and are not radio nodes", () => {
    const s = evaState({ EV1: [700, 0] });
    const sheltered: EngineState = { ...s, crew: s.crew.map((c) => (c.crew_id === "EV1" ? { ...c, activity: "SHELTERED" as const, linked: false, stale: true } : c)) };
    const r = linksTick(sheltered, ctxOf(sheltered));
    expect(links(r.events).map((e) => e.kind)).toEqual(["LINK_RESTORED"]);
    const out = applied(sheltered, r);
    expect(crewOf(out, "EV1")).toMatchObject({ linked: true, stale: false, link_hops: 0, link_via: null });
    expect(out.links.map((l) => l.node_id)).toEqual(["HAB"]);
  });

  it("since_sim_time moves only when linked_to_hab changes", () => {
    let s = evaState({ EV1: [100, 0] });
    s = stepTo(s, "EV1", 150, 1).state;
    s = stepTo(s, "EV1", 200, 5).state;
    expect(s.links.find((l) => l.node_id === "EV1")!.since_sim_time).toBe(iso(T0 + 1000));
    s = stepTo(s, "EV1", FIRST_SHADOW_X + 50, 7).state;
    expect(s.links.find((l) => l.node_id === "EV1")!.since_sim_time).toBe(iso(T0 + 7000));
  });

  it("changes nothing without a routing grid or a comm layer (the fake scenario has neither)", () => {
    const s = evaState({ EV1: [700, 0] });
    for (const bare of [fake, { ...sc, comm: null }, { ...sc, grid: null }]) {
      const r = linksTick(s, ctxOf(s, bare));
      expect(r.events).toEqual([]);
      expect(r.deltas).toEqual([]);
      expect(r.state).toBe(s);
    }
  });

  it("is deterministic, leaves its input alone, and its state survives a JSON round trip", () => {
    const s = evaState({ EV1: [700, 0], EV2: [600, 150] });
    const before = JSON.stringify(s);
    const a = linksTick(s, ctxOf(s));
    const b = linksTick(s, ctxOf(s));
    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const restored = JSON.parse(JSON.stringify(a.state)) as EngineState;
    expect(restored).toStrictEqual(a.state);
  });

  it("reports a STATE_DELTA for every link field it changed, and none when nothing changed", () => {
    const s = evaState({ EV1: [300, 0] });
    const first = linksTick(s, ctxOf(s));
    // EV1's path ["EV1", "HAB"] is the initial one, so it is not reported; hops, via and the time are new.
    expect(first.deltas.map((d) => d.path).sort()).toEqual(["crew/EV1/last_linked_sim_time", "crew/EV1/link_hops", "crew/EV1/link_via", "crew/EV2/last_linked_sim_time", "crew/EV2/link_hops", "crew/EV2/link_via"].sort());
    const again = linksTick(applied(s, first), ctxOf(applied(s, first)));
    expect(again.deltas).toEqual([]);
  });
});

describe("COMM_SHADOW on the remaining route (FR-42, 01 §E.1 step 7)", () => {
  /** The distance from x = 0 to the first sample without hab coverage along y = 0, from the oracle layer. */
  const firstUncovered = (() => {
    const { meta } = fx.grid;
    for (let x = 0; x < 1000; x += CELL) {
      if (comm.comm_hab[Math.floor(meta.origin_m[1] / CELL) * meta.width + Math.floor((x - meta.origin_m[0]) / CELL)] !== 1) return x;
    }
    return null;
  })();

  it("a route through the shadow raises one caution per crew member, with the distance to it and action-first wording", () => {
    expect(firstUncovered).toBe(FIRST_SHADOW_X);
    const s = evaState({ EV1: [0, 0], EV2: [0, 0] });
    const r = linksTick(s, ctxOf(s));
    const raised = shadows(r.events);
    expect(raised).toHaveLength(2);
    const first = raised[0].data as LogEventData["ALERT_RAISED"];
    expect(first).toMatchObject({ code: "COMM_SHADOW", level: "caution", subjects: ["EV1"], alert_id: `a-${s.session.last_seq + 1}` });
    expect(first.message.length).toBeLessThanOrEqual(60);
    expect(first.message).toBe("Comm shadow ahead — stay with EV2"); // 03 §C.6 step 7
    expect((first as Record<string, unknown>).distance_m).toBeCloseTo(FIRST_SHADOW_X, 6);
    expect(raised[0].provenance).toMatchObject({ "data.distance_m": "derived" });
    expect((raised[1].data as LogEventData["ALERT_RAISED"]).subjects).toEqual(["EV2"]);
  });

  it("the distance counts from where the crew member is on the route, not from its start", () => {
    const s = evaState({ EV1: [200, 0] });
    s.motion.EV1 = walk(0, (200 / 1000) * legSeconds(shortPlan(1000).result.legs[0] as OkLeg));
    const r = linksTick(s, ctxOf(s));
    expect((shadows(r.events)[0].data as Record<string, unknown>).distance_m).toBeCloseTo(FIRST_SHADOW_X - 200, 6);
  });

  it("coverage ends at the hab-suit range of the link ParamSet even where the line of sight is clear", () => {
    const link = Object.values(sc.params).find((p) => p.kind === "link")!;
    const range = 300;
    const short: LoadedScenario = { ...sc, params: { ...sc.params, [link.param_set_id]: { ...link, values: { ...link.values, range_hab_suit_m: range } } as ParamSet } };
    const s = evaState({ EV1: [0, 0] }, shortPlan(FIRST_SHADOW_X - 2 * CELL));
    const raised = shadows(linksTick(s, ctxOf(s, short)).events);
    expect(raised).toHaveLength(1);
    expect((raised[0].data as Record<string, unknown>).distance_m).toBeCloseTo(range + CELL, 6);
    // The link itself obeys the same range (compute): 5 m past it the crew member is unlinked.
    const far = evaState({ EV1: [range + CELL, 0] });
    expect(crewOf(applied(far, linksTick(far, ctxOf(far, short))), "EV1").linked).toBe(false);
  });

  it("a route inside the hab's coverage raises nothing", () => {
    const s = evaState({ EV1: [0, 0], EV2: [0, 0] }, shortPlan(FIRST_SHADOW_X - 2 * CELL));
    expect(shadows(linksTick(s, ctxOf(s)).events)).toEqual([]);
  });

  it("raises once: an open COMM_SHADOW is not raised again on the next tick", () => {
    const s = evaState({ EV1: [0, 0] });
    const next = applied(s, linksTick(s, ctxOf(s)));
    expect(shadows(linksTick(next, ctxOf(next)).events)).toEqual([]);
  });

  it("a linked relay rover whose viewshed covers the shadow clears it", () => {
    const s = evaState({ EV1: [0, 0] });
    const raised = applied(s, linksTick(s, ctxOf(s)));
    expect(raised.alerts.filter((a) => a.code === "COMM_SHADOW")).toHaveLength(1);
    const covered: EngineState = { ...raised, vehicles: [...raised.vehicles, relay(800, 200)] };
    const r = linksTick(covered, ctxOf(covered));
    expect(r.events.map((e) => e.kind)).toEqual(["ALERT_CLEARED"]);
    expect((r.events[0].data as LogEventData["ALERT_CLEARED"]).alert_id).toBe(raised.alerts[0].alert_id);
    // Nothing is raised again while the relay stays parked.
    const cleared = applied(covered, r);
    expect(shadows(linksTick(cleared, ctxOf(cleared)).events)).toEqual([]);
  });

  it("the shadow is back when the relay leaves", () => {
    const s = evaState({ EV1: [0, 0] }, shortPlan(1000), [relay(800, 200)]);
    expect(shadows(linksTick(s, ctxOf(s)).events)).toEqual([]);
    const gone: EngineState = { ...s, vehicles: s.vehicles.map((v) => (v.vehicle_id === "UR1" ? { ...v, state: "RETURNING" as const } : v)) };
    expect(shadows(linksTick(gone, ctxOf(gone)).events)).toHaveLength(1);
  });

  it("a relay that is cut off from the hab does not cover the shadow", () => {
    const s = evaState({ EV1: [0, 0] }, shortPlan(1000), [relay(800, 0)]);
    expect(shadows(linksTick(s, ctxOf(s)).events)).toHaveLength(1);
  });

  it("clears when the shadow is behind the crew member, and when the crew member is no longer out", () => {
    const s = evaState({ EV1: [0, 0] }, shortPlan(1000));
    const raised = applied(s, linksTick(s, ctxOf(s)));
    // At the stop, the way back starts at x = 1000: the shadow is still ahead (the return leg crosses it again).
    const home: EngineState = { ...raised, crew: raised.crew.map((c) => (c.crew_id === "EV1" ? { ...c, activity: "IN_HAB" as const } : c)) };
    const r = linksTick(home, ctxOf(home));
    expect(r.events.filter((e) => e.kind === "ALERT_CLEARED")).toHaveLength(1);
    // Held at the end of the route: nothing ahead.
    const held: EngineState = { ...raised, motion: { EV1: { ...walk(), phase: "hold", leg_index: 2 } } };
    expect(linksTick(held, ctxOf(held)).events.filter((e) => e.kind === "ALERT_CLEARED")).toHaveLength(1);
  });

  it("a crew member with no motion record or no plan raises nothing", () => {
    const s = evaState({ EV1: [0, 0] });
    const noMotion: EngineState = { ...s, motion: {} };
    expect(shadows(linksTick(noMotion, ctxOf(noMotion)).events)).toEqual([]);
    const noPlan: EngineState = { ...s, plan: null };
    expect(shadows(linksTick(noPlan, ctxOf(noPlan)).events)).toEqual([]);
  });

  it("a lone crew member gets wording that does not name a buddy", () => {
    const s = evaState({ EV1: [0, 0] });
    const msg = (shadows(linksTick(s, ctxOf(s)).events)[0].data as LogEventData["ALERT_RAISED"]).message;
    expect(msg.length).toBeLessThanOrEqual(60);
    expect(msg).toBe("Comm shadow ahead — call a relay or turn back");
  });

  it("is a warning-free caution: the contingency module (warnings only) never answers it", () => {
    const s = evaState({ EV1: [0, 0] });
    expect((shadows(linksTick(s, ctxOf(s)).events)[0].data as LogEventData["ALERT_RAISED"]).level).not.toBe("warning");
  });
});

describe("engine hygiene (NFR-06)", () => {
  it("links.ts reads no wall clock and keeps no mutable module state beyond a pure memo", async () => {
    const { readFileSync: read } = await import("node:fs");
    const source = read(join(here, "../src/engine/links.ts"), "utf8");
    expect(source).not.toMatch(/Date\.now|new Date\(\)|performance\.now|Math\.random/);
    expect(source).not.toMatch(/^let /m);
  });
});

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let x = from; step > 0 ? x <= to : x >= to; x += step) out.push(x);
  return out;
}
