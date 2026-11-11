/**
 * Conditions interface and assembly (docs/specs/02 §D.4, §D.5; 05 §C PlanResult; contract C8).
 * FR-11, FR-12. TASK-06 (T06.09).
 * Assembles timeline LTST, sun elevation, EVA-sol conditions, and radiation dose from what the caller supplies.
 *
 * The handler does not call this yet. Until the team records the five choices below, `handler.ts` returns the
 * M3 empty `stops_timeline` and omits `conditions` and `radiation` (TASK-06 T06.09 reconciliation note).
 * Open C8 decisions (TASK-06 §T06.01, T06.09):
 * - TODO(decision): Site coordinate. Which point gives the solar latitude and longitude: the Gale boxwork AOI
 *   centre or the habitat mast (05 Site has no single site point). This function takes it as `inputs.site`.
 * - TODO(decision): EnvConstant selection. The provisional rule below accepts exactly one record whose
 *   `const_id` starts with "rad-", whose unit is "mSv/day" and whose `conditions.solar_phase` equals the
 *   scenario's; zero or several matches omit `radiation`. The team confirms it or sets another rule.
 * - TODO(decision): Dose duration for PARTIAL plans. `totals` is null then (02 §E.2), so the caller has no
 *   routed duration; planned `max_eva_duration_h` vs unavailable is not settled. This function takes `durationH`;
 *   a `durationH` of 0 is accepted and gives a dose of 0 (not an omitted block), so a caller must not pass 0 for "unknown".
 * - TODO(decision): DARKNESS inputs. Sunrise/sunset UTC or sun elevation along legs and dwell; arrival elevation
 *   alone does not cover the EVA interval. Nothing here feeds `collectWarnings`.
 * - TODO(decision): Timing boundaries. What `timing_ms.routing` and `timing_ms.estimates` measure. Nothing here
 *   measures time, and the pure handler never reads a clock (NFR-06).
 *
 * Sunrise/sunset contract (T06.07): sunriseSunset throws SunEventsUnavailableError (a RangeError) when the
 * sun does not cross the flat horizon in the sol (polar day or night). 05 PlanResult.conditions has no
 * absent-event form, so `conditions` is omitted for that error; any other error propagates.
 * TODO(decision): team to confirm; not reachable at Gale (lat about -4.7 deg).
 */
import type { EnvConstant, MissionScenario, PlanResult } from "@marswalk/protocol";
import { localTrueSolarTime, solarLongitude } from "./mars24";
import { estimateDose } from "./radiation";
import { SunEventsUnavailableError, solarPosition, sunriseSunset } from "./sun";

export interface ConditionsInputs {
  /** Site reference coordinate for solar calculations (lat planetocentric °, lon_e east-positive °). */
  site: { lat: number; lon_e: number };
  /** Scheduled arrival/departure UTC at each stop (from evaTimeline). */
  timeline: { arrive_utc: string; depart_utc: string }[];
  /** Mission scenario with solar_phase and eva_start_utc. */
  scenario: MissionScenario;
  /** Available environment constants (the RAD records, 05 §C). */
  envConstants: EnvConstant[];
  /** EVA duration in hours for dose estimation; a non-finite or negative value omits `radiation`. */
  durationH: number;
}

export interface ConditionsResult {
  /** Per-waypoint arrival LTST and sun elevation (05 §C PlanResult.stops_timeline). */
  stops_timeline: PlanResult["stops_timeline"];
  /** Flat-horizon solar conditions for the sol of eva_start_utc; absent when the sun has no sunrise or sunset there. */
  conditions?: NonNullable<PlanResult["conditions"]>;
  /** Background radiation dose estimate; absent when no single EnvConstant matches or the duration is unusable. */
  radiation?: NonNullable<PlanResult["radiation"]>;
}

/** Provisional EnvConstant selection (TODO(decision) in the header): one `rad-` rate in mSv/day for the phase. */
function selectRadiationRate(envConstants: EnvConstant[], solarPhase: MissionScenario["solar_phase"]): EnvConstant | undefined {
  const matches = envConstants.filter(
    (c) => c.const_id.startsWith("rad-") && c.unit === "mSv/day" && c.conditions?.solar_phase === solarPhase,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Assemble per-stop solar conditions, EVA-sol conditions, and background radiation dose (Contract C8).
 * Pure function: takes timeline and scenario, returns conditions components of PlanResult. TASK-06 (T06.09).
 * Never substitutes a value: an unavailable block is omitted.
 */
export function assembleConditions(inputs: ConditionsInputs): ConditionsResult {
  const { site, timeline, scenario, envConstants, durationH } = inputs;

  // 1. Per-stop timeline: arrival LTST ("HH:MM") and solar elevation
  const stops_timeline: PlanResult["stops_timeline"] = timeline.map((entry) => {
    const arriveDate = new Date(entry.arrive_utc);
    return {
      arrive_utc: entry.arrive_utc,
      depart_utc: entry.depart_utc,
      arrive_ltst: localTrueSolarTime(arriveDate, site.lon_e),
      sun_elevation_deg: solarPosition(arriveDate, site.lat, site.lon_e).elevation_deg,
    };
  });

  const result: ConditionsResult = { stops_timeline };

  // 2. EVA-sol conditions for the sol containing eva_start_utc (flat horizon)
  const evaStartDate = new Date(scenario.eva_start_utc);
  try {
    const sun = sunriseSunset(evaStartDate, site.lat, site.lon_e);
    const sol = solarLongitude(evaStartDate);
    result.conditions = {
      mars_year: sol.mars_year,
      ls_deg: sol.ls_deg,
      sunrise_ltst: sun.sunrise_ltst,
      sunset_ltst: sun.sunset_ltst,
      sunrise_utc: sun.sunrise_utc,
      sunset_utc: sun.sunset_utc,
    };
  } catch (err) {
    if (!(err instanceof SunEventsUnavailableError)) throw err;
  }

  // 3. Radiation dose estimate for the scenario's solar phase
  const rate = selectRadiationRate(envConstants, scenario.solar_phase);
  if (rate !== undefined && Number.isFinite(durationH) && durationH >= 0) {
    const dose = estimateDose(rate, durationH);
    if (dose !== undefined) result.radiation = dose;
  }

  return result;
}
