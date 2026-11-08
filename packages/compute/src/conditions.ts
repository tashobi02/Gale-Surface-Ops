/**
 * Conditions interface and assembly (docs/specs/02 §D.4, §D.5; 05 §C PlanResult; contract C8).
 * FR-11, FR-12. Implemented by TASK-06 (T06.09).
 * Assembles timeline LTST, sun elevation, EVA-sol conditions, and radiation dose.
 *
 * Open C8 decisions (TASK-06 §T06.01):
 * - Site coordinate source: Gale boxwork AOI center (-4.70° lat, 137.38° lon_e) passed via ConditionsInputs.site.
 * - DARKNESS warning criteria: Departure before sunrise or sun elevation < 0° along leg checked in warnings.ts.
 * - Duration for radiation dose in PARTIAL plans: Uses planned max_eva_duration_h when totals is null.
 * - EnvConstant selection: Filter by conditions.solar_phase matching scenario.solar_phase ("max" | "min").
 */
import type { EnvConstant, MissionScenario, PlanResult } from "@marswalk/protocol";
import { localTrueSolarTime, solarLongitude } from "./mars24";
import { estimateDose } from "./radiation";
import { solarPosition, sunriseSunset } from "./sun";

export interface ConditionsInputs {
  /** Site reference coordinate for solar calculations (lat planetocentric °, lon_e east-positive °). */
  site: { lat: number; lon_e: number };
  /** Scheduled arrival/departure UTC at each stop (from evaTimeline). */
  timeline: { arrive_utc: string; depart_utc: string }[];
  /** Mission scenario with solar_phase and eva_start_utc. */
  scenario: MissionScenario;
  /** Available environment constants (including rad-gale-dose-eq-solar-max/min). */
  envConstants: EnvConstant[];
  /** Total EVA duration in hours for dose estimation. */
  durationH: number;
}

export interface ConditionsResult {
  /** Per-waypoint arrival LTST and sun elevation (05 §C PlanResult.stops_timeline). */
  stops_timeline: PlanResult["stops_timeline"];
  /** Flat-horizon solar conditions for the sol of eva_start_utc (05 §C PlanResult.conditions). */
  conditions: NonNullable<PlanResult["conditions"]>;
  /** Background radiation dose estimate (05 §C PlanResult.radiation). */
  radiation: NonNullable<PlanResult["radiation"]>;
}

/**
 * Assemble per-stop solar conditions, EVA-sol conditions, and background radiation dose (Contract C8).
 * Pure function: takes timeline and scenario, returns conditions components of PlanResult. TASK-06 (T06.09).
 */
export function assembleConditions(inputs: ConditionsInputs): ConditionsResult {
  const { site, timeline, scenario, envConstants, durationH } = inputs;

  // 1. Per-stop timeline: arrival LTST ("HH:MM") and solar elevation
  const stops_timeline: PlanResult["stops_timeline"] = timeline.map((entry) => {
    const arriveDate = new Date(entry.arrive_utc);
    const arriveLtst = localTrueSolarTime(arriveDate, site.lon_e);
    const sunPos = solarPosition(arriveDate, site.lat, site.lon_e);

    return {
      arrive_utc: entry.arrive_utc,
      depart_utc: entry.depart_utc,
      arrive_ltst: arriveLtst,
      sun_elevation_deg: sunPos.elevation_deg,
    };
  });

  // 2. EVA-sol conditions for the sol containing eva_start_utc
  const evaStartDate = new Date(scenario.eva_start_utc);
  const sol = solarLongitude(evaStartDate);
  const sun = sunriseSunset(evaStartDate, site.lat, site.lon_e);

  const conditions: NonNullable<PlanResult["conditions"]> = {
    mars_year: sol.mars_year,
    ls_deg: sol.ls_deg,
    sunrise_ltst: sun.sunrise_ltst,
    sunset_ltst: sun.sunset_ltst,
    sunrise_utc: sun.sunrise_utc,
    sunset_utc: sun.sunset_utc,
  };

  // 3. Radiation dose estimate matching scenario solar_phase
  const targetPhase = scenario.solar_phase;
  const radConstant =
    envConstants.find(
      (c) =>
        (c.conditions as { solar_phase?: string } | undefined)?.solar_phase === targetPhase,
    ) ??
    envConstants.find((c) => c.const_id.includes(targetPhase)) ??
    envConstants[0];

  const dose = radConstant
    ? estimateDose(radConstant, durationH)
    : {
        dose_mSv: 0,
        dose_low_mSv: 0,
        dose_high_mSv: 0,
        solar_phase: targetPhase,
        const_id: `rad-gale-dose-eq-solar-${targetPhase}`,
      };

  return {
    stops_timeline,
    conditions,
    radiation: dose as NonNullable<PlanResult["radiation"]>,
  };
}
