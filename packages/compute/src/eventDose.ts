/**
 * Space-weather replay: trigger and dose integral (docs/specs/02 §D.13; FR-37, FR-38). TASK-05b (T05b.15).
 * Units: absorbed dose µGy and µGy/h. Never converted to Sv for the event. Pure; sim time only.
 *
 * Rules where 02 §D.13 is silent (proposals, written in tests/eventDose.test.ts):
 * - The rate holds the last sample at or before t; before the first sample or in a gap it is null.
 * - A gap breaks "2 consecutive samples" and resets the clear timer.
 * - The integral uses the rate at the start of each step; gap seconds are reported.
 */
import type { DoseSeries, ParamSet } from "@marswalk/protocol";

function num(p: ParamSet, key: string): number {
  const value = (p.values as Record<string, unknown>)[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`eventDose: ParamSet ${p.param_set_id} has no number ${key}`);
  return value;
}

/** Index of the last sample at or before t (ms), or -1. Samples are strictly increasing (05 DoseSeries). */
function lastAtOrBefore(series: DoseSeries, t_ms: number): number {
  let lo = 0;
  let hi = series.samples.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Date.parse(series.samples[mid][0]) <= t_ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Replayed rate at t; step-hold between samples; null before the first sample and inside a gap. */
export function rateAt(series: DoseSeries, t_utc: string): number | null {
  const i = lastAtOrBefore(series, Date.parse(t_utc));
  return i < 0 ? null : series.samples[i][1];
}

/**
 * Trigger state: alert when rate > k × background for 2 consecutive samples; clear when
 * rate < clear_k × background for clear_min minutes (05 ParamSet kind `alert`).
 */
export function triggerState(series: DoseSeries, t_utc: string, alertParams: ParamSet): "nominal" | "alert" {
  const trigger = num(alertParams, "rad_k_background") * series.background_rate;
  const clearLevel = num(alertParams, "rad_clear_k") * series.background_rate;
  const clearMs = num(alertParams, "rad_clear_min") * 60_000;
  const t = Date.parse(t_utc);
  const last = lastAtOrBefore(series, t);
  let alert = false;
  let highs = 0;
  let lowSince: number | null = null;
  for (let i = 0; i <= last; i++) {
    const [ts, rate] = series.samples[i];
    const at = Date.parse(ts);
    if (alert && lowSince !== null && at - lowSince >= clearMs) {
      alert = false;
      lowSince = null;
    }
    if (rate === null) {
      highs = 0;
      lowSince = null;
      continue;
    }
    if (!alert) {
      highs = rate > trigger ? highs + 1 : 0;
      if (highs >= 2) {
        alert = true;
        highs = 0;
      }
    } else {
      lowSince = rate < clearLevel ? (lowSince ?? at) : null;
    }
  }
  if (alert && lowSince !== null && t - lowSince >= clearMs) alert = false;
  return alert ? "alert" : "nominal";
}

/** Received and "if unsheltered" event dose, µGy, and the seconds that fell in a gap (02 §D.13). */
export interface EventDose {
  received_ugy: number;
  unsheltered_ugy: number;
  gap_s: number;
}

/** dose = Σ rate(t) × shielding(location(t)) × Δt, with Δt in hours. "If unsheltered" uses the suit factor. */
export function integrateDose(
  series: DoseSeries,
  steps: { t_utc: string; dt_s: number; shelter: "suit" | "pressurized_rover" | "hab" | "refuge"; refuge_factor?: number }[],
  shielding: ParamSet,
): EventDose {
  const suit = num(shielding, "suit");
  const out: EventDose = { received_ugy: 0, unsheltered_ugy: 0, gap_s: 0 };
  for (const step of steps) {
    let factor: number;
    if (step.shelter === "refuge") {
      if (typeof step.refuge_factor !== "number" || !Number.isFinite(step.refuge_factor)) throw new Error("integrateDose: a refuge step needs refuge_factor (sky-view factor, 02 §D.16)");
      factor = step.refuge_factor;
    } else factor = num(shielding, step.shelter);
    const rate = rateAt(series, step.t_utc);
    if (rate === null) {
      out.gap_s += step.dt_s;
      continue;
    }
    const hours = step.dt_s / 3600;
    out.received_ugy += rate * factor * hours;
    out.unsheltered_ugy += rate * suit * hours;
  }
  return out;
}
