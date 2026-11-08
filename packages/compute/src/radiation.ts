/**
 * Radiation dose estimate (docs/specs/02 §D.4; ADR-005). FR-12. Implemented by TASK-06.
 * Model: dose_mSv = rate_mSv_per_day × duration_h / 24, with low/high from the EnvConstant.
 * Label: measured background rate × planned duration (simplified). Excludes SEP events,
 * suit/habitat shielding, terrain sky-blocking and altitude differences within the AOI.
 */
import type { EnvConstant, PlanResult } from "@marswalk/protocol";

/** Input: EnvConstant (mSv/day) and EVA duration (h). Output: PlanResult.radiation. TASK-06. */
export function estimateDose(rate: EnvConstant, durationH: number): PlanResult["radiation"] {
  const solar_phase = (rate.conditions?.solar_phase === "min" ? "min" : "max") as "max" | "min";
  return {
    dose_mSv: (rate.value * durationH) / 24,
    dose_low_mSv: (rate.low * durationH) / 24,
    dose_high_mSv: (rate.high * durationH) / 24,
    solar_phase,
    const_id: rate.const_id,
  };
}
