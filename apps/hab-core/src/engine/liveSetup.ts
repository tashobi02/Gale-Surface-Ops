/**
 * The live-session setup commands: SELECT_HAB_SITE and SET_MISSION_SETUP (docs/specs/02 §D.17, §E.3; 01 FR-53; 05
 * Session, HabCandidate), and the hab-site helpers the session manager uses for them and for RESET_SESSION. T32.14
 * (backend package 08; decisions BD-115 .. BD-118). Pure; sim time only, never wall-clock (NFR-06); no module state.
 *
 * What lives where: the validators and event builders are here and are called by commands.ts, which has already
 * checked the role. The effects that replace or swap the session (the new session of a reset, the swapped comm grid)
 * are the session manager's, because they touch the log and the scenario in use; they call `prepareSite`,
 * `relocateCrew` and `buildHabSite` below. `RESET_SESSION` itself has no validator: any status is allowed, so
 * commands.ts only turns it into the `reset` effect.
 *
 * Rules (decided by the orchestrator, 12 Nov 2026, BD-115 .. BD-118; tests: tests/liveSetup.test.ts):
 * - SELECT_HAB_SITE: `INVALID` for a missing, empty or unknown `candidate_id` (a Site with no candidates has none to
 *   choose); `BUSY` unless the session is LOADED and has no plan (a plan's start waypoint is its hab). Logs
 *   SITE_SELECTED. Choosing the candidate already chosen is accepted and logged.
 * - The chosen hab: the crew are in the hab at the candidate's `default_start` (05 HabCandidate: "the planner's start
 *   waypoint"), the session uses the candidate's `comm_hab` grid and mast (`loadCandidateComm`), and the haven field is
 *   recomputed from that point (compute `habTimeField`). Without a plan there is no MissionScenario, so the field's
 *   slope limits and walking speed come from the first crew member's suit ParamSet (`hard_slope_deg`,
 *   `caution_slope_deg`, `flat_speed_kmh`, labelled `assumed` there); a scenario with a reference plan uses that
 *   plan's MissionScenario, as `havenTick` does.
 * - SET_MISSION_SETUP: `INVALID` for an empty argument set, a key that is not one of the five settings, a value of the
 *   wrong type or outside 02 §E.3 (`crew_count` 1-2, `max_haven_min` 5-120, `solar_phase` max|min), a `crew_count`
 *   other than the number of scenario `crew[]` entries, a `vehicle_param_set` that is not a pressurized-rover ParamSet of
 *   the scenario, and `vehicle_available: true` with no ParamSet given or already set; `BUSY` unless LOADED. Logs the
 *   keys set (`MISSION_SETUP_SET`); the reducer merges them. A published plan keeps its own MissionScenario: the
 *   settings are the defaults the planner starts from (02 §D.17).
 * - Arguments are checked before state, as everywhere in commands.ts.
 */
import { habTimeField, type TimeField } from "@marswalk/compute";
import { PROTOCOL_VERSION, type Command, type CommandResult, type HabCandidate, type LogEventData, type MissionScenario, type MissionSetup } from "@marswalk/protocol";
import { loadCandidateComm, type LoadedScenario } from "../scenario";
import type { CommandOutcome, EngineState, PendingEvent } from "./reducer";

/** What the session manager does after SITE_SELECTED is logged (commands.ts `SessionEffect`). */
export interface SiteEffect {
  kind: "site";
  candidate_id: string;
}

export interface SetupOutcome extends CommandOutcome {
  effect?: SiteEffect;
}

/** The chosen hab as the session holds it: its mast, its comm grid and the haven field computed from its start. */
export interface HabSite {
  candidate_id: string;
  hab_mast: { x_m: number; y_m: number; height_m: number };
  comm_hab: Uint8Array;
  /** Seconds to walk to the hab from every cell (compute `habTimeField`); Infinity = unreachable. */
  haven: TimeField;
}

const SETTING_KEYS = ["crew_count", "vehicle_available", "vehicle_param_set", "solar_phase", "max_haven_min"] as const;
/** 02 §E.3. */
const CREW_COUNT_RANGE = [1, 2] as const;
const MAX_HAVEN_RANGE_MIN = [5, 120] as const;

const refused = (command: Command, code: "INVALID" | "BUSY", message: string): SetupOutcome => ({
  result: { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: false, code, message } satisfies CommandResult,
  events: [],
});

function accepted(state: EngineState, command: Command, kind: "SITE_SELECTED" | "MISSION_SETUP_SET", data: LogEventData["SITE_SELECTED"] | LogEventData["MISSION_SETUP_SET"], effect?: SiteEffect): SetupOutcome {
  const event: PendingEvent = { sim_time: state.session.clock.sim_time, kind, actor: command.role, data: data as Record<string, unknown>, provenance: {} };
  // event_seq is filled in by handleCommand from ctx.next_seq.
  const result: CommandResult = { v: PROTOCOL_VERSION, type: "COMMAND_RESULT", command_id: command.command_id, ok: true, event_seq: 0 };
  return effect ? { result, events: [event], effect } : { result, events: [event] };
}

/** The Site's candidate with this id, or undefined (also undefined when the scenario has no site). */
export function candidateOf(scenario: LoadedScenario, candidate_id: string | null): HabCandidate | undefined {
  return candidate_id === null ? undefined : scenario.site?.hab_candidates.find((c) => c.candidate_id === candidate_id);
}

/** SELECT_HAB_SITE (02 §D.17): validate and build SITE_SELECTED. The swap itself is the session manager's (`prepareSite`). */
export function selectHabSite(state: EngineState, scenario: LoadedScenario, command: Command): SetupOutcome {
  const id = command.args?.candidate_id;
  if (typeof id !== "string" || id.length === 0) return refused(command, "INVALID", "SELECT_HAB_SITE needs args.candidate_id");
  if (candidateOf(scenario, id) === undefined) {
    const known = (scenario.site?.hab_candidates ?? []).map((c) => c.candidate_id);
    return refused(command, "INVALID", `unknown hab candidate ${id}; the Site offers ${known.length > 0 ? known.join(", ") : "none"}`);
  }
  if (state.session.status !== "LOADED") return refused(command, "BUSY", `Selecting a hab site is not possible while the session is ${state.session.status}`);
  if (state.plan !== null) return refused(command, "BUSY", "Selecting a hab site is not possible once a plan is published; its start waypoint is the hab (02 §D.17)");
  return accepted(state, command, "SITE_SELECTED", { candidate_id: id }, { kind: "site", candidate_id: id });
}

const isInRange = (v: unknown, [lo, hi]: readonly [number, number]): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** SET_MISSION_SETUP (02 §D.17, §E.3): validate and build MISSION_SETUP_SET with the keys set. */
export function setMissionSetup(state: EngineState, scenario: LoadedScenario, command: Command): SetupOutcome {
  const a = command.args ?? {};
  const keys = Object.keys(a);
  if (keys.length === 0) return refused(command, "INVALID", `SET_MISSION_SETUP needs at least one of ${SETTING_KEYS.join(", ")}`);
  const unknown = keys.filter((k) => !(SETTING_KEYS as readonly string[]).includes(k));
  if (unknown.length > 0) return refused(command, "INVALID", `SET_MISSION_SETUP: unknown setting ${unknown.join(", ")}; the settings are ${SETTING_KEYS.join(", ")}`);

  const set: Partial<MissionSetup> = {};
  const bad = (message: string): SetupOutcome => refused(command, "INVALID", `SET_MISSION_SETUP: ${message}`);
  if (a.crew_count !== undefined) {
    if (!isInRange(a.crew_count, CREW_COUNT_RANGE) || !Number.isInteger(a.crew_count)) return bad(`crew_count must be 1 or 2 (02 §E.3), got ${String(a.crew_count)}`);
    if (a.crew_count !== scenario.scenario.crew.length) return bad(`crew_count ${a.crew_count} differs from the ${scenario.scenario.crew.length} crew[] entries of the scenario`);
    set.crew_count = a.crew_count as MissionSetup["crew_count"];
  }
  if (a.vehicle_available !== undefined) {
    if (typeof a.vehicle_available !== "boolean") return bad("vehicle_available must be true or false");
    set.vehicle_available = a.vehicle_available;
  }
  if (a.vehicle_param_set !== undefined) {
    if (typeof a.vehicle_param_set !== "string" || scenario.params[a.vehicle_param_set]?.kind !== "pressurized_rover") {
      return bad(`vehicle_param_set ${String(a.vehicle_param_set)} is not a pressurized_rover ParamSet of the scenario`);
    }
    set.vehicle_param_set = a.vehicle_param_set;
  }
  if (a.solar_phase !== undefined) {
    if (a.solar_phase !== "max" && a.solar_phase !== "min") return bad(`solar_phase must be max or min, got ${String(a.solar_phase)}`);
    set.solar_phase = a.solar_phase;
  }
  if (a.max_haven_min !== undefined) {
    if (!isInRange(a.max_haven_min, MAX_HAVEN_RANGE_MIN)) return bad(`max_haven_min must be ${MAX_HAVEN_RANGE_MIN[0]}-${MAX_HAVEN_RANGE_MIN[1]} minutes (02 §E.3), got ${String(a.max_haven_min)}`);
    set.max_haven_min = a.max_haven_min;
  }
  const current = state.session.mission_setup;
  const available = set.vehicle_available ?? current.vehicle_available;
  const paramSet = set.vehicle_param_set ?? current.vehicle_param_set;
  if (available && !paramSet) return bad("vehicle_available is true and no vehicle_param_set is given or set");
  if (state.session.status !== "LOADED") return refused(command, "BUSY", `Changing the mission setup is not possible while the session is ${state.session.status}`);

  // Fixed key order, so the same settings always give the same log line.
  const data: Partial<MissionSetup> = {};
  for (const k of SETTING_KEYS) if (k in set) (data as Record<string, unknown>)[k] = set[k];
  return accepted(state, command, "MISSION_SETUP_SET", data);
}

/** The three MissionScenario values compute's `habTimeField` reads (its C15 signature takes a whole MissionScenario). */
type SuitedInputs = Pick<MissionScenario, "hard_slope_limit_deg" | "caution_slope_deg" | "suited_flat_speed_kmh">;

/**
 * The slope limits and walking speed for a suited field when the session has no plan of its own: the reference plan's
 * MissionScenario if the scenario has one, else the first crew member's suit ParamSet. Throws naming the missing key.
 */
function suitedInputs(scenario: LoadedScenario): SuitedInputs {
  const plan = scenario.scenario.plan;
  if (plan !== undefined) return plan.scenario;
  const entry = scenario.scenario.crew[0];
  const suit = entry === undefined ? undefined : scenario.params[entry.suit_param_set];
  if (suit === undefined) throw new Error("buildHabSite: the scenario has no suit ParamSet to take the haven field's speed and slope limits from");
  const pick = (key: string): number => {
    const v = suit.values[key];
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`buildHabSite: suit ParamSet ${suit.param_set_id} has no numeric ${key}`);
    return v;
  };
  return { hard_slope_limit_deg: pick("hard_slope_deg"), caution_slope_deg: pick("caution_slope_deg"), suited_flat_speed_kmh: pick("flat_speed_kmh") };
}

/**
 * The chosen hab for `candidate_id`: the comm grid and mast the scenario holds (the session swaps them first, see
 * `prepareSite`) and the haven field from the candidate's `default_start`. Null when there is no candidate, no site or
 * no routing grid (the fake scenario). Throws RangeError (compute) when the start is outside the grid.
 */
export function buildHabSite(scenario: LoadedScenario, candidate_id: string | null): HabSite | null {
  const candidate = candidateOf(scenario, candidate_id);
  if (candidate === undefined || scenario.grid === null || scenario.comm === null) return null;
  // `habTimeField` reads only the three fields of SuitedInputs; a plan-less session has no other MissionScenario value to give it,
  // and none is invented for it (BD-115), hence the narrowed object passed under the full type.
  const haven = habTimeField(scenario.grid, { x_m: candidate.default_start.x_m, y_m: candidate.default_start.y_m }, suitedInputs(scenario) as MissionScenario);
  return { candidate_id: candidate.candidate_id, hab_mast: { ...scenario.comm.hab_mast }, comm_hab: scenario.comm.comm_hab, haven };
}

/**
 * The scenario with `candidate_id`'s comm grid and mast, and the hab built from it. Reads the candidate's asset
 * through the loader's checks (`loadCandidateComm`), so a missing or altered file throws ScenarioCheckError and nothing
 * is logged by the caller. Needs the SiteRef the scenario was read with.
 */
export function prepareSite(scenario: LoadedScenario, candidate_id: string): { scenario: LoadedScenario; site: HabSite } {
  if (scenario.site_ref === undefined) throw new Error("prepareSite: the scenario was not read with a site, so a candidate's comm grid cannot be loaded");
  const swapped: LoadedScenario = { ...scenario, comm: loadCandidateComm(scenario.site_ref, candidate_id) };
  const site = buildHabSite(swapped, candidate_id);
  if (site === null) throw new Error(`prepareSite: no hab can be built for candidate ${candidate_id}`);
  return { scenario: swapped, site };
}

/**
 * After SITE_SELECTED: crew in the hab are at the chosen candidate's `default_start`, their haven the hab itself. The
 * reducer cannot do it (the event carries only the id), so the session manager calls this in both the live path and
 * resume; it is a pure function of the state and the scenario, so the fold stays deterministic.
 */
export function relocateCrew(state: EngineState, scenario: LoadedScenario, candidate_id: string): EngineState {
  const start = candidateOf(scenario, candidate_id)?.default_start;
  if (start === undefined) return state;
  return {
    ...state,
    crew: state.crew.map((c) => (c.activity === "IN_HAB" ? { ...c, x_m: start.x_m, y_m: start.y_m, haven: { ...c.haven, target_x_m: start.x_m, target_y_m: start.y_m } } : c)),
  };
}
