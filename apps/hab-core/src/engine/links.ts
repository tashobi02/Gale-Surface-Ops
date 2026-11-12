/**
 * Surface link graph, LINK_LOST / LINK_RESTORED and COMM_SHADOW (docs/specs/02 §D.11, §A.5 L-surf; 03 §E.10; 01 FR-42;
 * 05 LinkState, Crew). T26.01 (backend package 17). Pure; sim time only, never wall-clock (NFR-06).
 *
 * No line-of-sight maths here: every edge comes from `@marswalk/compute` (`linkStates` for the graph and the BFS path to
 * the hab, `lineOfSight` for each pair, `viewshed` for a relay's coverage). This module picks the nodes and copies the
 * result into `state.links` and the crew fields.
 *
 * Rules (Proposed 2026-11-12, backend package 17; decided by the orchestrator (Claude) under Sadman Shaharier Mahim's
 * authority, 12 Nov 2026; BD-103, BD-130):
 * - Nodes: the hab mast (the chosen candidate's, `LoadedScenario.comm.hab_mast`), every crew member on EVA (WALKING,
 *   AT_STOP or TO_HAVEN and not waiting out `start_offset_s`, antenna = the suit ParamSet's `antenna_m`) and every utility
 *   rover parked as a relay (state ARRIVED, task RELAY; antenna = its ParamSet's `antenna_m`, a missing key throws and
 *   names it). Crew in the hab or sheltered are linked and are not radio nodes (02 §D.11: nodes are the mast, suits in
 *   the field and rovers). A rover that is moving, or has another task, is no relay.
 * - A crew member is linked when `linkStates` finds a path to HAB (direct, via a buddy suit, or via a relay rover that
 *   is itself linked). A change is a LINK_LOST / LINK_RESTORED event with `node_id` the crew id; the reducer then sets
 *   `linked` and `stale` (tick.ts state rule). `link_path` is the BFS path (`[]` when unlinked), `link_hops` its edge
 *   count (null when unlinked, 0 when not on a radio link) and `link_via` the kind of the first hop (BD-103): `direct`
 *   to the hab, `relay` to a rover, `crew` to a buddy. `last_linked_sim_time` is the sim time of the last tick the
 *   member was linked (N-03). There is no signal strength anywhere (BD-103).
 * - COMM_SHADOW is a `caution` alert per crew member (03 §C.6 step 7 calls it a caution; a warning would start the
 *   contingency options of 02 §D.15), raised while a stretch of the member's remaining route has neither the hab's
 *   static `comm_hab` (within the hab-suit range) nor the viewshed of a linked relay (within the rover range), and
 *   cleared when none is left or the member is no longer out. The route is sampled once per grid cell along each leg;
 *   the alert data carries `distance_m` along the route to the first uncovered stretch, `derived`.
 * - With no routing grid or no comm layer (the fake scenario) the module changes nothing.
 *
 * The two WeakMaps below only memoise pure functions of their (immutable) keys, as `lengthCache` in tick.ts does: a
 * relay's viewshed (about a second on the real grid, 02 §D.11) and a plan's route samples. They are not engine state:
 * the results never depend on them.
 */
import {
  cellIndex,
  lineOfSight,
  linkStates,
  RELAY_VIEWSHED_CELL_M,
  RELAY_VIEWSHED_RADIUS_M,
  viewshed,
  type CoverageGrid,
  type LinkNode,
  type LoadedGrid,
} from "@marswalk/compute";
import type { Alert, Crew, CrewId, Leg, LinkState, LogEventData, ParamSet, Vehicle } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import { legSeconds } from "./crewMargins";
import { isWaiting, type EngineState, type PendingEvent, type StateChange } from "./reducer";
import type { TickContext, TickResult } from "./tick";

const MESSAGES = {
  // 03 §C.6 step 7 wording; the distance is the alert's `distance_m` (derived), not text, so the message stays true.
  withBuddy: (buddy: string): string => `Comm shadow ahead — stay with ${buddy}`,
  alone: "Comm shadow ahead — call a relay or turn back",
} as const;

const HAB = "HAB";

function numberOf(p: ParamSet, key: string): number {
  const value = (p.values as Record<string, unknown>)[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`links: ParamSet ${p.param_set_id} has no number ${key}`);
  return value;
}

function paramsOf(scenario: LoadedScenario, id: string, what: string): ParamSet {
  const p = scenario.params[id];
  if (!p) throw new Error(`links: ${what} has no ParamSet ${id} in the scenario (05 Scenario)`);
  return p;
}

/** The ParamSet of kind `link` (the three ranges of 02 §D.11, read again by compute). */
function linkParams(scenario: LoadedScenario): ParamSet {
  const p = Object.values(scenario.params).find((x) => x.kind === "link");
  if (!p) throw new Error("links: the scenario has no link ParamSet (05 Scenario)");
  return p;
}

const suitOf = (scenario: LoadedScenario, crew_id: CrewId): ParamSet => {
  const id = scenario.scenario.crew.find((c) => c.crew_id === crew_id)?.suit_param_set;
  return paramsOf(scenario, id ?? "", `crew ${crew_id}`);
};

/** A crew member out on the surface and not waiting out `start_offset_s` (the radio-node test). */
function isOut(state: EngineState, scenario: LoadedScenario, c: Crew): boolean {
  if (c.activity !== "WALKING" && c.activity !== "AT_STOP" && c.activity !== "TO_HAVEN") return false;
  const offset_s = scenario.scenario.crew.find((x) => x.crew_id === c.crew_id)?.start_offset_s ?? 0;
  return !isWaiting(c, state.motion[c.crew_id], offset_s);
}

const isParkedRelay = (v: Vehicle): boolean => v.kind === "utility_rover" && v.state === "ARRIVED" && v.task?.kind === "RELAY";

export function linksTick(state: EngineState, ctx: TickContext): TickResult {
  const scenario = ctx.scenario;
  const grid = scenario.grid;
  const comm = scenario.comm;
  if (grid === null || comm === null) return { state, events: [], deltas: [] };

  const params = linkParams(scenario);
  const now = state.session.clock.sim_time;
  const mast = comm.hab_mast;

  // ---- nodes: the hab, crew on EVA, parked relays --------------------------------------------------------------------
  const nodes: LinkNode[] = [{ node_id: HAB, kind: "hab", x_m: mast.x_m, y_m: mast.y_m, antenna_m: mast.height_m }];
  const out = state.crew.filter((c) => isOut(state, scenario, c));
  for (const c of out) nodes.push({ node_id: c.crew_id, kind: "suit", x_m: c.x_m, y_m: c.y_m, antenna_m: numberOf(suitOf(scenario, c.crew_id), "antenna_m") });
  const relays = state.vehicles.filter(isParkedRelay);
  for (const v of relays) nodes.push({ node_id: v.vehicle_id, kind: "rover", x_m: v.x_m, y_m: v.y_m, antenna_m: numberOf(paramsOf(scenario, v.param_set, `vehicle ${v.vehicle_id}`), "antenna_m") });

  const los = (a: LinkNode, b: LinkNode): boolean =>
    lineOfSight(grid, { x_m: a.x_m, y_m: a.y_m, height_m: a.antenna_m }, { x_m: b.x_m, y_m: b.y_m, height_m: b.antenna_m });
  const graph = linkStates(nodes, los, params, now, state.links);
  const byId = new Map(graph.map((g) => [g.node_id, g]));
  const kindOf = new Map(nodes.map((n) => [n.node_id, n.kind]));

  // ---- crew: link fields, events, deltas -----------------------------------------------------------------------------
  const events: PendingEvent[] = [];
  const deltas: StateChange[] = [];
  const crew: Crew[] = state.crew.map((c) => {
    const node = isOut(state, scenario, c) ? byId.get(c.crew_id) : undefined;
    // Not on a radio link (in the hab, sheltered, waiting): linked, no hops, no first hop.
    const linked = node === undefined ? true : node.linked_to_hab;
    const path = node === undefined ? [c.crew_id, HAB] : node.path_to_hab;
    const next: Crew = {
      ...c,
      link_path: path,
      link_hops: node === undefined ? 0 : linked ? path.length - 1 : null,
      link_via: node === undefined || !linked ? null : firstHop(kindOf.get(path[1])),
      last_linked_sim_time: linked ? now : (c.last_linked_sim_time ?? null),
    };
    if (linked !== c.linked) events.push(linkEvent(now, linked ? "LINK_RESTORED" : "LINK_LOST", c.crew_id));
    for (const key of ["link_path", "link_hops", "link_via", "last_linked_sim_time"] as const) {
      if (JSON.stringify(next[key]) !== JSON.stringify(c[key])) deltas.push({ path: `crew/${c.crew_id}/${key}`, value: next[key] });
    }
    return next;
  });
  const stored: LinkState[] = graph.map(({ node_id, neighbors, linked_to_hab, since_sim_time }) => ({ node_id, neighbors, linked_to_hab, since_sim_time }));
  const current: EngineState ={ ...state, crew, links: stored };

  // ---- COMM_SHADOW ---------------------------------------------------------------------------------------------------
  const linkedRelays = relays.filter((v) => byId.get(v.vehicle_id)?.linked_to_hab === true);
  for (const e of shadowEvents(current, ctx, linkedRelays, params, ctx.next_seq + events.length)) events.push(e);
  return { state: current, events, deltas };
}

function linkEvent(sim_time: string, kind: "LINK_LOST" | "LINK_RESTORED", crew_id: CrewId): PendingEvent {
  const data: LogEventData["LINK_LOST"] = { node_id: crew_id };
  return { sim_time, kind, actor: "system", data, provenance: {} };
}

/** BD-103: the kind of the first hop of the path. */
function firstHop(kind: LinkNode["kind"] | undefined): "direct" | "relay" | "crew" | null {
  return kind === "hab" ? "direct" : kind === "rover" ? "relay" : kind === "suit" ? "crew" : null;
}

// ---- COMM_SHADOW --------------------------------------------------------------------------------------------------------

interface Sample {
  x_m: number;
  y_m: number;
  /** Arc length from the start of the leg, projected metres. */
  along_m: number;
}
interface LegSamples {
  total_m: number;
  samples: Sample[];
}

const sampleCache = new WeakMap<LoadedGrid, WeakMap<Leg[], (LegSamples | null)[]>>();
const viewshedCache = new WeakMap<LoadedGrid, Map<string, CoverageGrid>>();

/** Samples of every leg of a plan, one per grid cell along the polyline and its end point; null for a leg with no route. */
function routeSamples(grid: LoadedGrid, legs: Leg[]): (LegSamples | null)[] {
  let perGrid = sampleCache.get(grid);
  if (!perGrid) sampleCache.set(grid, (perGrid = new WeakMap()));
  let cached = perGrid.get(legs);
  if (!cached) {
    const step = grid.meta.cell_m;
    cached = legs.map((leg) => (leg.status === "OK" ? sampleLeg(leg.geometry as [number, number][], step) : null));
    perGrid.set(legs, cached);
  }
  return cached;
}

function sampleLeg(geometry: [number, number][], step_m: number): LegSamples {
  const samples: Sample[] = [];
  let before = 0;
  let next = 0; // arc length of the next sample
  for (let i = 0; i + 1 < geometry.length; i++) {
    const [ax, ay] = geometry[i];
    const [bx, by] = geometry[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    while (next <= before + len && len > 0) {
      const f = (next - before) / len;
      samples.push({ x_m: ax + (bx - ax) * f, y_m: ay + (by - ay) * f, along_m: next });
      next += step_m;
    }
    before += len;
  }
  const last = geometry[geometry.length - 1];
  if (last !== undefined && (samples.length === 0 || samples[samples.length - 1].along_m < before)) samples.push({ x_m: last[0], y_m: last[1], along_m: before });
  return { total_m: before, samples };
}

function relayCoverage(grid: LoadedGrid, v: Vehicle, antenna_m: number, target_m: number): CoverageGrid {
  let perGrid = viewshedCache.get(grid);
  if (!perGrid) viewshedCache.set(grid, (perGrid = new Map()));
  const key = `${v.x_m}|${v.y_m}|${antenna_m}|${target_m}`;
  let cov = perGrid.get(key);
  if (!cov) {
    cov = viewshed(grid, { x_m: v.x_m, y_m: v.y_m, height_m: antenna_m }, target_m, RELAY_VIEWSHED_RADIUS_M, RELAY_VIEWSHED_CELL_M);
    perGrid.set(key, cov);
  }
  return cov;
}

/** 1 when the coverage grid marks the point visible; the grid is laid out like 05 RoutingGrid (row 0 north). */
function seen(cov: CoverageGrid, x_m: number, y_m: number): boolean {
  const i = Math.floor((cov.origin_m[1] - y_m) / cov.cell_m);
  const j = Math.floor((x_m - cov.origin_m[0]) / cov.cell_m);
  return i >= 0 && i < cov.height && j >= 0 && j < cov.width && cov.visible[i * cov.width + j] === 1;
}

/** Metres along the remaining route to the first stretch without coverage, or null when none is left. */
function distanceToShadow(state: EngineState, scenario: LoadedScenario, grid: LoadedGrid, c: Crew, covered: (x: number, y: number) => boolean): number | null {
  const plan = state.plan;
  const m = state.motion[c.crew_id];
  if (plan === null || m === undefined || m.phase === "hold") return null;
  const legs = plan.result.legs;
  const per = routeSamples(grid, legs);
  let ahead = 0;
  for (let li = m.leg_index; li < legs.length; li++) {
    const leg = per[li];
    const raw = legs[li];
    if (!leg || raw.status !== "OK") continue;
    const from = li === m.leg_index && m.phase === "walk" ? Math.min(m.t_s / Math.max(legSeconds(raw), Number.MIN_VALUE), 1) * leg.total_m : 0;
    for (const s of leg.samples) {
      if (s.along_m < from) continue;
      if (!covered(s.x_m, s.y_m)) return ahead + (s.along_m - from);
    }
    ahead += leg.total_m - from;
  }
  return null;
}

function shadowEvents(state: EngineState, ctx: TickContext, relays: Vehicle[], link: ParamSet, first_seq: number): PendingEvent[] {
  const scenario = ctx.scenario;
  const grid = scenario.grid as LoadedGrid;
  const comm = scenario.comm!;
  const habRange = numberOf(link, "range_hab_suit_m");
  const roverRange = numberOf(link, "range_rover_m");
  const events: PendingEvent[] = [];
  const out = state.crew.filter((c) => isOut(state, scenario, c));
  const open = (id: CrewId): Alert[] => state.alerts.filter((a) => a.code === "COMM_SHADOW" && a.cleared_seq === null && a.subjects.includes(id));

  for (const c of state.crew) {
    const mine = open(c.crew_id);
    const target_m = isOut(state, scenario, c) ? numberOf(suitOf(scenario, c.crew_id), "antenna_m") : 0;
    let distance: number | null = null;
    if (isOut(state, scenario, c)) {
      const coverage = relays.map((v) => ({ v, cov: relayCoverage(grid, v, numberOf(paramsOf(scenario, v.param_set, `vehicle ${v.vehicle_id}`), "antenna_m"), target_m) }));
      const covered = (x: number, y: number): boolean => {
        const idx = cellIndex(grid, x, y);
        if (idx !== null && comm.comm_hab[idx] === 1 && Math.hypot(x - comm.hab_mast.x_m, y - comm.hab_mast.y_m) <= habRange) return true;
        return coverage.some(({ v, cov }) => Math.hypot(x - v.x_m, y - v.y_m) <= roverRange && seen(cov, x, y));
      };
      distance = distanceToShadow(state, scenario, grid, c, covered);
    }
    if (distance === null) {
      for (const a of mine) events.push({ sim_time: state.session.clock.sim_time, kind: "ALERT_CLEARED", actor: "system", data: { alert_id: a.alert_id } satisfies LogEventData["ALERT_CLEARED"], provenance: {} });
      continue;
    }
    if (mine.length > 0) continue;
    const buddy = out.find((o) => o.crew_id !== c.crew_id);
    const data: LogEventData["ALERT_RAISED"] = {
      alert_id: `a-${first_seq + events.length}`,
      code: "COMM_SHADOW",
      level: "caution",
      subjects: [c.crew_id],
      message: buddy === undefined ? MESSAGES.alone : MESSAGES.withBuddy(buddy.crew_id),
      distance_m: distance,
    };
    events.push({ sim_time: state.session.clock.sim_time, kind: "ALERT_RAISED", actor: "system", data, provenance: { "data.distance_m": "derived" } });
  }
  return events;
}
