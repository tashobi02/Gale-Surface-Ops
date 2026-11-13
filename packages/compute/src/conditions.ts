/**
 * Conditions interface and assembly (docs/specs/02 §D.4, §D.5; 05 §C PlanResult; contract C8).
 * FR-11, FR-12. TASK-06 (T06.09).
 * Assembles timeline LTST, sun elevation, EVA-sol conditions, and radiation dose from what the caller supplies.
 *
 * The handler calls this for every COMPUTE_PLAN (handler.ts). The five C8 choices are decided in BD-50 and BD-122:
 * - Site coordinate: the plan's start waypoint (the hab) through the inverse working projection; the handler passes
 *   it as `inputs.site` (lat planetocentric, lon_e east-positive), and every solar function here uses it.
 * - EnvConstant selection: exactly one record whose `const_id` starts with "rad-", whose unit is "mSv/day" and whose
 *   `conditions.solar_phase` equals the scenario's; zero or several matches omit `radiation`.
 * - Dose duration: the routed EVA total. A PARTIAL plan has no totals (02 §E.2), so the handler passes `durationH:
 *   null` and `radiation` is omitted; a `durationH` of 0 is a real zero dose, never "unknown".
 * - Darkness inputs: this function returns the arrival sun elevation of every timeline entry and the EVA-sol
 *   `sunrise_utc` / `sunset_utc`; `collectWarnings` (package 14, BD-49) reads them for DARKNESS.
 * - Timing: nothing here reads a clock (NFR-06). The worker adapter measures `timing_ms` (BD-50).
 *
 * Sunrise/sunset contract (BD-56): sunriseSunset throws SunEventsUnavailableError (a RangeError) when the
 * sun does not cross the flat horizon in the sol (polar day or night). 05 PlanResult.conditions has no
 * absent-event form, so `conditions` is omitted for that error; any other error propagates. Not reachable at
 * Gale (lat about -4.7 deg).
 */
import type { EnvConstant, MissionScenario, PlanResult } from "@marswalk/protocol";
import { localTrueSolarTime, mslSol, solarLongitude } from "./mars24";
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
  /** Routed EVA duration in hours for dose estimation; `null` (PARTIAL plan), non-finite or negative omits `radiation`. */
  durationH: number | null;
}

export interface ConditionsResult {
  /** Per-waypoint arrival LTST and sun elevation (05 §C PlanResult.stops_timeline). */
  stops_timeline: PlanResult["stops_timeline"];
  /** Flat-horizon solar conditions for the sol of eva_start_utc; absent when the sun has no sunrise or sunset there. */
  conditions?: NonNullable<PlanResult["conditions"]>;
  /** Background radiation dose estimate; absent when no single EnvConstant matches or the duration is unusable. */
  radiation?: NonNullable<PlanResult["radiation"]>;
}

/** EnvConstant selection (BD-50): exactly one `rad-` rate in mSv/day for the phase. */
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
      sol: mslSol(evaStartDate, site.lon_e),
    };
  } catch (err) {
    if (!(err instanceof SunEventsUnavailableError)) throw err;
  }

  // 3. Radiation dose estimate for the scenario's solar phase
  const rate = selectRadiationRate(envConstants, scenario.solar_phase);
  if (rate !== undefined && durationH !== null && Number.isFinite(durationH) && durationH >= 0) {
    const dose = estimateDose(rate, durationH);
    if (dose !== undefined) result.radiation = dose;
  }

  return result;
}
