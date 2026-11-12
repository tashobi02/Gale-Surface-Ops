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

/** Sample times in ms, parsed once per series (derived data; the series is never changed). */
const timesCache = new WeakMap<DoseSeries, Float64Array>();
function times(series: DoseSeries): Float64Array {
  let out = timesCache.get(series);
  if (!out) {
    out = Float64Array.from(series.samples, ([ts]) => parseUtc(ts));
    timesCache.set(series, out);
  }
  return out;
}

/** ISO time with an explicit Z or offset, so parsing never depends on the host time zone. */
function parseUtc(t_utc: string): number {
  const ms = /(Z|[+-]\d{2}:\d{2})$/.test(t_utc) ? Date.parse(t_utc) : NaN;
  if (Number.isNaN(ms)) throw new Error(`eventDose: ${t_utc} is not an ISO time with Z or an offset`);
  return ms;
}

/** Index of the last time ≤ t, or -1 (binary search; samples are strictly increasing, 05 DoseSeries). */
function lastAtOrBefore(ts: ArrayLike<number>, t_ms: number): number {
  let lo = 0;
  let hi = ts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t_ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Replayed rate at t; step-hold between samples; null before the first sample and inside a gap. */
export function rateAt(series: DoseSeries, t_utc: string): number | null {
  const i = lastAtOrBefore(times(series), parseUtc(t_utc));
  return i < 0 ? null : series.samples[i][1];
}

/**
 * Alert intervals [start, end) in ms for one series and one set of thresholds, found in a single
 * pass and cached, so `triggerState` is a binary search per tick. `end` is Infinity when the alert
 * never clears within the series (a trailing high or gap keeps it, the conservative side).
 */
const intervalCache = new WeakMap<DoseSeries, Map<string, { starts: number[]; ends: number[] }>>();
function alertIntervals(series: DoseSeries, trigger: number, clearLevel: number, clearMs: number): { starts: number[]; ends: number[] } {
  const key = `${trigger}|${clearLevel}|${clearMs}`;
  let byKey = intervalCache.get(series);
  if (!byKey) intervalCache.set(series, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const ts = times(series);
  const starts: number[] = [];
  const ends: number[] = [];
  let alert = false;
  let highs = 0;
  let lowSince: number | null = null;
  for (let i = 0; i < ts.length; i++) {
    const at = ts[i];
    const rate = series.samples[i][1];
    if (alert && lowSince !== null && at - lowSince >= clearMs) {
      ends.push(lowSince + clearMs);
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
        starts.push(at);
      }
    } else {
      lowSince = rate < clearLevel ? (lowSince ?? at) : null;
    }
  }
  if (alert) ends.push(lowSince !== null ? lowSince + clearMs : Infinity);
  const out = { starts, ends };
  byKey.set(key, out);
  return out;
}

/**
 * Trigger state: alert when rate > k × background for 2 consecutive samples; clear when
 * rate < clear_k × background for clear_min minutes (05 ParamSet kind `alert`).
 */
export function triggerState(series: DoseSeries, t_utc: string, alertParams: ParamSet): "nominal" | "alert" {
  if (!(series.background_rate > 0)) throw new Error(`eventDose: series ${series.series_id} needs a positive background_rate`);
  const trigger = num(alertParams, "rad_k_background") * series.background_rate;
  const clearLevel = num(alertParams, "rad_clear_k") * series.background_rate;
  const clearMs = num(alertParams, "rad_clear_min") * 60_000;
  const { starts, ends } = alertIntervals(series, trigger, clearLevel, clearMs);
  const i = lastAtOrBefore(starts, parseUtc(t_utc));
  return i >= 0 && parseUtc(t_utc) < ends[i] ? "alert" : "nominal";
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

/**
 * Planned background dose, µGy (docs/specs/05 PostEvaReport `planned_background_ugy`; BD-132): the series' own
 * `background_rate` (µGy/h, the quiet-time rate of the same recorded series that drives the crew's event dose) times the
 * duration in hours. Absorbed dose, never converted to or from Sv (02 §D.13), and with no shielding factor: the dose a
 * body in the open would take. Throws RangeError for a negative or non-finite duration or a `background_rate` that is not a
 * finite number ≥ 0. Pure.
 */
export function backgroundDoseUgy(series: DoseSeries, duration_s: number): number {
  if (!Number.isFinite(duration_s) || duration_s < 0) throw new RangeError(`backgroundDoseUgy: duration_s must be a finite number >= 0, got ${duration_s}`);
  if (!Number.isFinite(series.background_rate) || series.background_rate < 0) {
    throw new RangeError(`backgroundDoseUgy: series ${series.series_id} needs a background_rate that is a finite number >= 0, got ${series.background_rate}`);
  }
  return (series.background_rate * duration_s) / 3600;
}
