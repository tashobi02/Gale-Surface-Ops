/**
 * Conditions interface and assembly (docs/specs/02 §D.4, §D.5; 05 §C PlanResult; contract C8).
 * FR-11, FR-12. Implemented by TASK-06 (T06.09).
 * Assembles timeline LTST, sun elevation, EVA-sol conditions, and radiation dose.
 *
 * Open C8 decisions (TASK-06 §T06.01):
 * - TODO(decision): Site coordinate source. Gale boxwork AOI center (-4.70° lat, 137.38° lon_e) vs habitat mast coordinate.
 * - TODO(decision): DARKNESS warning criteria. Sunrise/sunset UTC comparison vs sun elevation threshold (< 0°) along path.
 * - TODO(decision): Duration for radiation dose in PARTIAL plans. When totals is null, use planned max_eva_duration_h vs actual routed duration.
 * - TODO(decision): EnvConstant selection. Match const_id directly ("rad-gale-dose-eq-solar-max"/"min") vs filter by conditions.solar_phase.
 *
 * Handler integration note (step 5 gap): handler.ts does not call assembleConditions
 * while it throws TODO(T06.09); C8 integration into handler is tracked under T05.32.
 */
import type { EnvConstant, MissionScenario, PlanResult } from "@marswalk/protocol";

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
export function assembleConditions(_inputs?: ConditionsInputs): ConditionsResult {
  throw new Error("TODO(T06.09): not implemented");
}
