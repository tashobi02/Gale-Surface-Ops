/**
 * Conditions feed values in the engine (docs/specs/01 FR-36, FR-11; 02 §D.5 solar, §D.13 dose rate; backend decisions
 * BD-75, BD-127). Pure; sim time only, never wall-clock (NFR-06). T22.16.
 *
 * `conditionsTick` fills `EngineState.conditions` for the instant the step ends at (`session.clock.sim_time`), from
 * `@marswalk/compute` only:
 * - LTST ("HH:MM"), sun elevation (flat horizon) and the MSL sol at the hab, with the hab's east-positive longitude (the
 *   west conversion is inside compute, 02 §C.4.1); `derived`, source `mars24-allison-mcewen-2000`.
 * - the replayed background rate (`DoseSeries.background_rate`) and the event rate, read through `doseAt` so there is no
 *   second dose model: the background before START_EVENT, the recorded series at the shifted time after it. A gap in the
 *   series is a null event rate, never the background. `replayed`, source `DoseSeries.source_id`.
 * - `event_series_utc`: the series time being played, null before START_EVENT.
 * SNAPSHOT carries them as `conditions` (BD-75); STATE_DELTA paths are `conditions/<key>`, reported only for the keys that
 * changed in the step. Temperature and pressure are absent ("not included in this build", FR-36).
 *
 * Where the hab is (BD-127): the chosen hab candidate of the Site (`session.hab_candidate_id`); with none, the plan's start
 * waypoint through the inverse working projection of the loaded grid (the rule of BD-50); with neither, or when compute
 * rejects the latitude or longitude (RangeError), the solar fields are null. Nothing is substituted or invented.
 *
 * The provenance classes and source ids belong to the field, not to the value, so they are set when the session starts
 * (`conditionsFrame`, used by `initialState`) and a client never sees a value without them.
 */
import { inverseEqc, localTrueSolarTime, mslSol, parseEqcProjection, rateAt, solarPosition } from "@marswalk/compute";
import type { ConditionsState } from "@marswalk/protocol";
import type { LoadedScenario } from "../scenario";
import { doseAt } from "./liveEvents";
import type { EngineState, StateChange } from "./reducer";
import type { TickContext, TickResult } from "./tick";

/** FR-36 values at the hab; the type lives in packages/protocol (SNAPSHOT `conditions`, BD-75). null until the first tick. */
export type { ConditionsState };

/** The registered source of the Mars24 algorithms (pipeline/sites/gale_boxwork/sources). */
const MARS24_SOURCE_ID = "mars24-allison-mcewen-2000";

type VALUE_KEY = "ltst" | "sun_elevation_deg" | "sol" | "dose_rate_background_ugy_h" | "dose_rate_event_ugy_h" | "event_series_utc";
const VALUE_KEYS: readonly VALUE_KEY[] = ["ltst", "sun_elevation_deg", "sol", "dose_rate_background_ugy_h", "dose_rate_event_ugy_h", "event_series_utc"];

/** The part of `conditions` that does not depend on the clock: provenance classes and source ids, with every value null. */
export function conditionsFrame(scenario: LoadedScenario): ConditionsState {
  const dose = scenario.dose.source_id;
  return {
    ltst: null,
    sun_elevation_deg: null,
    dose_rate_background_ugy_h: null,
    dose_rate_event_ugy_h: null,
    event_series_utc: null,
    sol: null,
    source_ids: {
      ltst: MARS24_SOURCE_ID,
      sun_elevation_deg: MARS24_SOURCE_ID,
      sol: MARS24_SOURCE_ID,
      dose_rate_background_ugy_h: dose,
      dose_rate_event_ugy_h: dose,
    },
    provenance: {
      ltst: "derived",
      sun_elevation_deg: "derived",
      sol: "derived",
      dose_rate_background_ugy_h: "replayed",
      dose_rate_event_ugy_h: "replayed",
    },
  };
}

/** Planetocentric latitude and east-positive longitude of the hab, or null when the scenario cannot place it (BD-127). */
function habPlace(state: EngineState, scenario: LoadedScenario): { lat: number; lon_e: number } | null {
  const id = state.session.hab_candidate_id;
  const candidate = id === null || id === undefined ? undefined : scenario.site?.hab_candidates.find((c) => c.candidate_id === id);
  if (candidate !== undefined) return { lat: candidate.lat, lon_e: candidate.lon_e };
  const start = state.plan?.waypoints.find((w) => w.role === "start");
  if (scenario.grid !== null && start !== undefined) return inverseEqc(start.x_m, start.y_m, parseEqcProjection(scenario.grid.meta.proj4));
  return null;
}

/** LTST, sun elevation and sol at the hab, or nulls when the hab cannot be placed or compute rejects its coordinates. */
function solar(state: EngineState, scenario: LoadedScenario, now: Date): Pick<ConditionsState, "ltst" | "sun_elevation_deg" | "sol"> {
  const none = { ltst: null, sun_elevation_deg: null, sol: null };
  const hab = habPlace(state, scenario);
  if (hab === null) return none;
  try {
    return {
      ltst: localTrueSolarTime(now, hab.lon_e),
      sun_elevation_deg: solarPosition(now, hab.lat, hab.lon_e).elevation_deg,
      sol: mslSol(now, hab.lon_e),
    };
  } catch (error) {
    if (error instanceof RangeError) return none;
    throw error;
  }
}

/** Update `conditions`: solar values via Mars24 (east longitude in), replayed dose rates through `doseAt`. */
export function conditionsTick(state: EngineState, ctx: TickContext): TickResult {
  const scenario = ctx.scenario;
  const sim_time = state.session.clock.sim_time;
  const source = doseAt(state, scenario, sim_time);
  const frame = conditionsFrame(scenario);
  const next: ConditionsState = {
    ...frame,
    ...solar(state, scenario, new Date(sim_time)),
    dose_rate_background_ugy_h: scenario.dose.background_rate,
    dose_rate_event_ugy_h: rateAt(source.series, source.t_utc),
    event_series_utc: source.event_id === null ? null : source.t_utc,
  };

  const before = state.conditions;
  const deltas: StateChange[] = [];
  for (const key of VALUE_KEYS) if (before[key] !== next[key]) deltas.push({ path: `conditions/${key}`, value: next[key] });
  // The frame is constant per scenario; a state restored from an older snapshot may lack it.
  for (const key of ["source_ids", "provenance"] as const) {
    if (JSON.stringify(before[key]) !== JSON.stringify(next[key])) deltas.push({ path: `conditions/${key}`, value: next[key] });
  }
  if (deltas.length === 0) return { state, events: [], deltas };
  return { state: { ...state, conditions: next }, events: [], deltas };
}
