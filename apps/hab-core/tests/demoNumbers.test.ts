/**
 * T21.15 (TASK-21; FR-34, FR-37, FR-38, FR-43; 01 §E.1): the demo timing numbers are derived from the
 * committed tables by `scripts/demo-numbers.ts`, a thin layer over `@marswalk/compute`.
 *
 * Four groups:
 * (a) the rule, on small synthetic inputs. Expected values come from compute (the oracle) or from
 *     plain date arithmetic on the synthetic inputs; nothing is a typed science number.
 * (b) the real committed tables: the derived values are stored as Vitest file snapshots, so a rebuilt
 *     table shows as a diff. Vitest writes the snapshot; nobody types the values.
 * (c) the stop-2 dwell rule against the real `plan.json`, skipped while that file is absent (T21.12).
 * (d) the docs-consistency check against 01 §E.1, skipped while it still has the X / Y placeholders or
 *     the "illustrative" note (T21.09 writes the values).
 *
 * Stop-2 dwell rule (decided by Sadman Shaharier Mahim, 2026-11-10): start = alert - (leg0 walk + dwell
 * + leg1 walk + dwell / 2), in minutes, rounded down to a whole UTC minute.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { localTrueSolarTime, sunriseSunset, triggerState } from "@marswalk/compute";
import type { DoseSeries, EarthLinkTable, ParamSet } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import {
  deriveDemoTiming,
  formatMarkdown,
  loadInputs,
  parseE1Claims,
  parseHabSite,
  isMainModule,
  type DemoTimingInputs,
  type PlanSlice,
} from "../scripts/demo-numbers";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../../..");
const PLAN_FILE = join(ROOT, "scenarios/storm-sol4190/plan.json");
const SPEC_01 = join(ROOT, "docs/specs/01_Product_Requirements_Document.md");

// ---------------------------------------------------------------------------
// Synthetic inputs
// ---------------------------------------------------------------------------

const HAB = { lat: -4.8, lonE: 137.4, source: { path: "synthetic/hab-site.md", row: "first choice" } };
const MIN = 60_000;
const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

const ALERT_PARAMS: ParamSet = {
  param_set_id: "alert-synthetic",
  kind: "alert",
  title: "synthetic",
  values: { rad_k_background: 10, rad_clear_k: 2, rad_clear_min: 30 },
  provenance: "assumed",
};

/** Series with background 1: a sample above 10 is "high". Samples are [ISO, rate]. */
function series(samples: [string, number | null][]): DoseSeries {
  return {
    series_id: "synthetic",
    quantity: "synthetic",
    unit: "uGy/h",
    samples,
    background_rate: 1,
    method: "archive",
    provenance: "replayed",
    source_id: "synthetic",
    integral_check: { expected_ugy: 0, computed_ugy: 0 },
  };
}

/** A table with 60 s rows from t0 whose light time rises by 10 s per row (so each row is distinct). */
function table(t0_ms: number, nRows: number, passes: EarthLinkTable["passes"]): EarthLinkTable {
  return {
    step_s: 60,
    rows: Array.from({ length: nRows }, (_, i) => ({
      t_utc: iso(t0_ms + i * MIN),
      light_time_s: 600 + 10 * i,
      sep_angle_deg: 40,
      earth_elev_deg: 10,
      orbiters: { mro: 0, maven: 0, tgo: 0 },
    })),
    passes,
    kernels: [],
    provenance: "derived",
  };
}

/** Sunrise and sunset (ms) of the sol containing a probe time at the synthetic hab; compute is the oracle. */
function sunFor(probe_ms: number): { rise: number; set: number } {
  const s = sunriseSunset(new Date(probe_ms), HAB.lat, HAB.lonE);
  return { rise: Date.parse(s.sunrise_utc), set: Date.parse(s.sunset_utc) };
}

const DAY_PROBE = Date.parse("2024-05-20T00:00:00Z");

/** Midday of the sol that holds DAY_PROBE, on a whole minute, plus 30 s, so the floor is visible. */
const sun = sunFor(DAY_PROBE);
const NOON_ALERT_MS = Math.floor((sun.rise + sun.set) / 2 / MIN) * MIN + 30_000;

/** Two quiet samples, then two high ones; the alert is the second high sample at `alert_ms`. */
function stormSeries(alert_ms: number): DoseSeries {
  return series([
    [iso(alert_ms - 40 * MIN), 1],
    [iso(alert_ms - 20 * MIN), 1],
    [iso(alert_ms - 10 * MIN), 50],
    [iso(alert_ms), 50],
    [iso(alert_ms + 20 * MIN), 50],
  ]);
}

const noPasses: EarthLinkTable["passes"] = [];

function inputs(alert_ms: number, extra: Partial<DemoTimingInputs> = {}): DemoTimingInputs {
  return {
    dose_series: { path: "synthetic/dose_series.json", data: stormSeries(alert_ms) },
    alert_params: { path: "synthetic/alert.json", data: ALERT_PARAMS },
    earth_link: { path: "synthetic/earth_link.json", data: table(alert_ms - 5 * MIN, 12, noPasses) },
    hab: HAB,
    ...extra,
  };
}

function plan(over: {
  walk0?: number;
  walk1?: number;
  dwell?: number;
  maxH?: number;
  status0?: "OK" | "NO_ROUTE";
  status1?: "OK" | "NO_ROUTE";
  to1?: string;
  waypoints?: string[];
  roles?: ("start" | "stop")[];
  legs?: number;
  evaStart?: string;
} = {}): PlanSlice {
  const legs = [
    { from: "wp-0", to: "wp-1", status: over.status0 ?? "OK", walk_time_min: over.walk0 ?? 30 },
    { from: "wp-1", to: over.to1 ?? "wp-2", status: over.status1 ?? "OK", walk_time_min: over.walk1 ?? 40 },
    { from: "wp-2", to: "wp-3", status: "OK", walk_time_min: 25 },
  ].slice(0, over.legs ?? 3) as PlanSlice["result"]["legs"];
  const roles = over.roles ?? ["start", "stop", "stop", "stop"];
  return {
    scenario: { dwell_min_per_stop: over.dwell ?? 20, max_eva_duration_h: over.maxH ?? 2, eva_start_utc: over.evaStart ?? "2024-05-20T00:00:00Z" },
    waypoints: (over.waypoints ?? ["wp-0", "wp-1", "wp-2", "wp-3"]).map((id, i) => ({ id, role: roles[i] ?? "stop" })),
    result: { legs },
  };
}

// ---------------------------------------------------------------------------
// (a) The rule on synthetic inputs
// ---------------------------------------------------------------------------

describe("T21.15 (a) alert sample selection", () => {
  it("takes the second of two consecutive high samples, the same sample triggerState reports first", () => {
    const t = deriveDemoTiming(inputs(NOON_ALERT_MS));
    expect(t.alert.t_utc).toBe(iso(NOON_ALERT_MS));
    expect(t.alert.source).toMatchObject({ path: "synthetic/dose_series.json", row: 3 });
    const s = stormSeries(NOON_ALERT_MS);
    expect(triggerState(s, s.samples[2][0], ALERT_PARAMS)).toBe("nominal");
    expect(triggerState(s, t.alert.t_utc, ALERT_PARAMS)).toBe("alert");
  });

  it("ignores a lone high sample and a high pair broken by a gap", () => {
    const base = NOON_ALERT_MS;
    const s = series([
      [iso(base - 60 * MIN), 50],
      [iso(base - 50 * MIN), 1],
      [iso(base - 40 * MIN), 50],
      [iso(base - 30 * MIN), null],
      [iso(base - 20 * MIN), 50],
      [iso(base - 10 * MIN), 50],
      [iso(base), 50],
    ]);
    const t = deriveDemoTiming(inputs(base, { dose_series: { path: "s.json", data: s }, earth_link: { path: "e.json", data: table(base - 70 * MIN, 80, noPasses) } }));
    expect(t.alert.source.row).toBe(5);
    expect(t.alert.t_utc).toBe(iso(base - 10 * MIN));
  });

  it("fails loudly when no sample reaches an alert", () => {
    const s = series([
      [iso(NOON_ALERT_MS), 1],
      [iso(NOON_ALERT_MS + 10 * MIN), 50],
    ]);
    expect(() => deriveDemoTiming(inputs(NOON_ALERT_MS, { dose_series: { path: "s.json", data: s } }))).toThrow(/no alert sample/);
  });

  it("reports LTST, sun events and sun elevation from compute at the alert", () => {
    const t = deriveDemoTiming(inputs(NOON_ALERT_MS));
    const events = sunriseSunset(new Date(NOON_ALERT_MS), HAB.lat, HAB.lonE);
    expect(t.alert.ltst).toBe(localTrueSolarTime(new Date(NOON_ALERT_MS), HAB.lonE));
    expect(t.sun).toMatchObject(events);
    expect(t.alert.is_daylight).toBe(true);
    expect(t.alert.sun_elevation_deg).toBeGreaterThan(0);
  });

  it("flags a night alert instead of hiding it", () => {
    const night = Math.floor(sun.set / MIN) * MIN + 60 * MIN;
    const t = deriveDemoTiming(inputs(night));
    expect(t.alert.is_daylight).toBe(false);
    expect(t.alert.sun_elevation_deg).toBeLessThan(0);
  });
});

describe("T21.15 (a) light time X", () => {
  it("uses the row at or before the alert, with its index and path", () => {
    // Rows start 5 min before the alert, so the alert row is index 5; shift the alert by 30 s to sit between rows.
    const alert = NOON_ALERT_MS;
    const tab = table(Math.floor(alert / MIN) * MIN - 5 * MIN, 12, noPasses);
    const t = deriveDemoTiming(inputs(alert, { earth_link: { path: "e.json", data: tab } }));
    expect(t.light_time.source).toMatchObject({ path: "e.json", row: 5 });
    expect(t.light_time.row_t_utc).toBe(tab.rows[5].t_utc);
    expect(t.light_time.light_time_s).toBe(tab.rows[5].light_time_s);
    expect(t.light_time.light_time_min).toBe(tab.rows[5].light_time_s / 60);
  });

  it("takes the exact row when the alert is on a row time", () => {
    const alert = Math.floor(NOON_ALERT_MS / MIN) * MIN;
    const tab = table(alert - 3 * MIN, 8, noPasses);
    const t = deriveDemoTiming(inputs(alert, { earth_link: { path: "e.json", data: tab } }));
    expect(t.light_time.source.row).toBe(3);
  });

  it("fails loudly when the alert is before the first row or the table is empty", () => {
    const early = table(NOON_ALERT_MS + 10 * MIN, 5, noPasses);
    expect(() => deriveDemoTiming(inputs(NOON_ALERT_MS, { earth_link: { path: "e.json", data: early } }))).toThrow(/before the first row/);
    const none = table(NOON_ALERT_MS, 0, noPasses);
    expect(() => deriveDemoTiming(inputs(NOON_ALERT_MS, { earth_link: { path: "e.json", data: none } }))).toThrow(/no rows/);
  });
});

describe("T21.15 (a) next relay pass Y", () => {
  const A = NOON_ALERT_MS;
  const pass = (orbiter: "mro" | "maven" | "tgo", s: number, e: number): EarthLinkTable["passes"][number] => ({
    orbiter,
    start_utc: iso(s),
    end_utc: iso(e),
    max_elev_deg: 30,
  });

  it("is the first pass with start >= alert, whatever the table order, with minutes of waiting", () => {
    const passes = [pass("mro", A + 90 * MIN, A + 100 * MIN), pass("tgo", A + 45 * MIN, A + 55 * MIN), pass("maven", A - 80 * MIN, A - 70 * MIN)];
    const t = deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: table(A - 5 * MIN, 12, passes) } }));
    expect(t.next_pass).toMatchObject({ orbiter: "tgo", start_utc: iso(A + 45 * MIN), end_utc: iso(A + 55 * MIN), source: { path: "e.json", row: 1 } });
    expect(t.next_pass?.wait_min).toBe(45);
    expect(t.alert_inside_pass).toBeNull();
  });

  it("counts a pass that starts exactly at the alert", () => {
    const t = deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: table(A - 5 * MIN, 12, [pass("mro", A, A + 10 * MIN)]) } }));
    expect(t.next_pass?.start_utc).toBe(iso(A));
    expect(t.next_pass?.wait_min).toBe(0);
    // The same pass is also the one the alert is inside (start <= alert < end): both fields, one pass.
    expect(t.alert_inside_pass).toMatchObject({ start_utc: iso(A), end_utc: iso(A + 10 * MIN), source: { row: 0 } });
  });

  it("does not count a pass that ends exactly at the alert as 'inside'", () => {
    const t = deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: table(A - 5 * MIN, 12, [pass("mro", A - 10 * MIN, A)]) } }));
    expect(t.alert_inside_pass).toBeNull();
    expect(t.next_pass).toBeNull();
  });

  it("rejects a pass time without Z or an offset, naming the field (M4)", () => {
    const bad = [{ orbiter: "mro" as const, start_utc: "2024-05-20T08:50:00", end_utc: "2024-05-20T08:56:00Z", max_elev_deg: 10 }];
    expect(() => deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: table(A - 5 * MIN, 12, bad) } }))).toThrow(/pass start.*ISO time with Z or an offset/);
    const dateOnly = [{ orbiter: "mro" as const, start_utc: "2024-05-20", end_utc: "2024-05-20T08:56:00Z", max_elev_deg: 10 }];
    expect(() => deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: table(A - 5 * MIN, 12, dateOnly) } }))).toThrow(/ISO time with Z or an offset/);
  });

  it("rejects a pass whose time lacks Z or an offset even when that pass is not the one chosen", () => {
    const early = [{ orbiter: "mro" as const, start_utc: "2024-05-20T01:00:00", end_utc: "2024-05-20T01:06:00Z", max_elev_deg: 10 }];
    expect(() => deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: table(A - 5 * MIN, 12, early) } }))).toThrow(/pass start.*ISO time with Z or an offset/);
    const badEnd = [{ orbiter: "mro" as const, start_utc: "2024-05-20T01:00:00Z", end_utc: "2024-05-20T01:06:00", max_elev_deg: 10 }];
    expect(() => deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: table(A - 5 * MIN, 12, badEnd) } }))).toThrow(/pass end.*ISO time with Z or an offset/);
  });

  it("rejects a row time without Z or an offset, naming the field", () => {
    const t = table(A - 5 * MIN, 12, noPasses);
    t.rows[0] = { ...t.rows[0], t_utc: "2024-05-20T05:45:00" };
    expect(() => deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: t } }))).toThrow(/row time.*ISO time with Z or an offset/);
    const t2 = table(A - 5 * MIN, 12, noPasses);
    // Row 5 (A - 5 min + 5 min) is the row at or before the alert, so it is the one the light time reads.
    t2.rows[5] = { ...t2.rows[5], t_utc: t2.rows[5].t_utc.replace("Z", "") };
    expect(() => deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: t2 } }))).toThrow(/row time.*ISO time with Z or an offset/);
  });

  it("accepts a +hh:mm offset", () => {
    const p = [{ orbiter: "mro" as const, start_utc: "2024-05-20T10:00:00+00:00", end_utc: "2024-05-20T11:00:00+00:00", max_elev_deg: 10 }];
    const t = deriveDemoTiming(inputs(Date.parse("2024-05-20T09:00:30Z"), { earth_link: { path: "e.json", data: table(Date.parse("2024-05-20T08:55:00Z"), 12, p) } }));
    expect(t.next_pass?.wait_min).toBeCloseTo(59.5, 6);
  });

  it("reports an alert inside a pass as a separate field and does not make it Y", () => {
    const passes = [pass("mro", A - 10 * MIN, A + 5 * MIN), pass("tgo", A + 30 * MIN, A + 40 * MIN)];
    const t = deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: table(A - 5 * MIN, 12, passes) } }));
    expect(t.alert_inside_pass).toMatchObject({ orbiter: "mro", start_utc: iso(A - 10 * MIN), end_utc: iso(A + 5 * MIN), source: { row: 0 } });
    expect(t.next_pass?.orbiter).toBe("tgo");
    expect(t.next_pass?.wait_min).toBe(30);
  });

  it("is null when no pass starts at or after the alert", () => {
    const t = deriveDemoTiming(inputs(A, { earth_link: { path: "e.json", data: table(A - 5 * MIN, 12, [pass("mro", A - 30 * MIN, A - 20 * MIN)]) } }));
    expect(t.next_pass).toBeNull();
  });
});

describe("T21.15 (a) stop-2 dwell rule", () => {
  const A = NOON_ALERT_MS;

  it("start = alert - (walk0 + dwell + walk1 + dwell / 2), floored to the UTC minute", () => {
    const t = deriveDemoTiming(inputs(A, { plan: plan({ walk0: 30, walk1: 40, dwell: 20 }) }));
    // 30 + 20 + 40 + 10 = 100 min; the alert has 30 s, which the floor drops.
    expect(t.eva?.eva_start_utc).toBe(iso(Math.floor(A / MIN) * MIN - 100 * MIN));
    expect(Date.parse(t.eva!.eva_start_utc) % MIN).toBe(0);
    expect(t.eva?.arr2_min).toBe(30 + 20 + 40);
    expect(t.eva?.offset_min).toBe(100);
  });

  it("handles fractional walk times and an odd dwell, flooring only the final instant", () => {
    const t = deriveDemoTiming(inputs(A, { plan: plan({ walk0: 30.4, walk1: 40.3, dwell: 15, maxH: 2 }) }));
    const exact = A - (30.4 + 15 + 40.3 + 7.5) * MIN;
    expect(t.eva?.eva_start_utc).toBe(iso(Math.floor(exact / MIN) * MIN));
  });

  it("states the asserted window: arr2 <= alert - start < arr2 + dwell", () => {
    const t = deriveDemoTiming(inputs(A, { plan: plan({ dwell: 20 }) }))!;
    const gapMin = (A - Date.parse(t.eva!.eva_start_utc)) / MIN;
    expect(gapMin).toBeGreaterThanOrEqual(t.eva!.arr2_min);
    expect(gapMin).toBeLessThan(t.eva!.arr2_min + 20);
  });

  it("fails loudly when the window cannot hold (dwell 0 leaves no dwell interval)", () => {
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ dwell: 0 }) }))).toThrow(/dwell window/);
  });

  it("fails loudly when leg 0 or leg 1 is not OK", () => {
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ status0: "NO_ROUTE" }) }))).toThrow(/legs\[0\].*OK/);
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ status1: "NO_ROUTE" }) }))).toThrow(/legs\[1\].*OK/);
  });

  it("fails loudly when leg 1 does not end at the second stop (waypoints[2])", () => {
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ to1: "wp-3" }) }))).toThrow(/waypoints\[2\]/);
  });

  it("fails loudly on a plan too short to have a second stop", () => {
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ legs: 1 }) }))).toThrow(/legs\[1\]/);
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ waypoints: ["wp-0", "wp-1"] }) }))).toThrow(/waypoints\[2\]/);
  });

  it("reports LTST and sun elevation at the start from compute, and whether the plan already holds it", () => {
    const t = deriveDemoTiming(inputs(A, { plan: plan() }));
    const start = new Date(t.eva!.eva_start_utc);
    expect(t.eva?.ltst).toBe(localTrueSolarTime(start, HAB.lonE));
    expect(t.eva?.matches_plan_eva_start_utc).toBe(false);
    expect(t.eva?.plan_eva_start_utc).toBe("2024-05-20T00:00:00Z");
  });

  it("passes the daylight asserts with 1 min margin when the whole EVA fits between sunrise and sunset", () => {
    const t = deriveDemoTiming(inputs(A, { plan: plan({ maxH: 2 }) }));
    const start = Date.parse(t.eva!.eva_start_utc);
    expect(start).toBeGreaterThanOrEqual(sun.rise + MIN);
    expect(start + 2 * 60 * MIN + MIN).toBeLessThanOrEqual(sun.set);
  });

  it("fails loudly, naming sunrise, when the start falls before sunrise + 1 min", () => {
    const a = Math.floor(sun.rise / MIN) * MIN + 30 * MIN;
    expect(() => deriveDemoTiming(inputs(a, { plan: plan() }))).toThrow(/sunrise/);
  });

  it("fails loudly, naming sunset, when the EVA would end after sunset - 1 min", () => {
    expect(() => deriveDemoTiming(inputs(NOON_ALERT_MS, { plan: plan({ maxH: 24 }) }))).toThrow(/sunset/);
  });

  it("is exactly on the margin: start == sunrise + 1 min passes, one minute earlier fails", () => {
    // Choose the alert so that floor(alert - 100 min) lands on the first whole minute at or after sunrise + 1 min.
    const startMin = Math.ceil((sun.rise + MIN) / MIN) * MIN;
    const ok = deriveDemoTiming(inputs(startMin + 100 * MIN, { plan: plan({ maxH: 1 }) }));
    expect(Date.parse(ok.eva!.eva_start_utc)).toBe(startMin);
    expect(() => deriveDemoTiming(inputs(startMin + 100 * MIN - MIN, { plan: plan({ maxH: 1 }) }))).toThrow(/sunrise/);
  });

  it("dwell 1 min upper bound: passes with the alert at :30 s and whole-minute walks, throws at :00 s", () => {
    const t = deriveDemoTiming(inputs(A, { plan: plan({ dwell: 1 }) }));
    expect((A - Date.parse(t.eva!.eva_start_utc)) / MIN).toBe(30 + 1 + 40 + 0.5);
    expect(() => deriveDemoTiming(inputs(A - 30_000, { plan: plan({ dwell: 1 }) }))).toThrow(/dwell window/);
  });

  it("is exactly on the sunset margin: end == sunset - 1 min passes, one minute later throws", () => {
    // maxH 2 h; choose the whole-minute start so that start + 2 h + 1 min <= sunset, the largest such minute.
    const startMin = Math.floor((sun.set - MIN - 2 * 60 * MIN) / MIN) * MIN;
    const ok = deriveDemoTiming(inputs(startMin + 100 * MIN, { plan: plan({ maxH: 2 }) }));
    expect(Date.parse(ok.eva!.eva_end_utc) + MIN).toBeLessThanOrEqual(sun.set);
    expect(Date.parse(ok.eva!.eva_end_utc) + 2 * MIN).toBeGreaterThan(sun.set);
    expect(() => deriveDemoTiming(inputs(startMin + MIN + 100 * MIN, { plan: plan({ maxH: 2 }) }))).toThrow(/sunset/);
  });

  it("matches_plan_eva_start_utc is true when the plan already holds the derived start", () => {
    const derived = iso(Math.floor(A / MIN) * MIN - 100 * MIN);
    const t = deriveDemoTiming(inputs(A, { plan: plan({ evaStart: derived }) }));
    expect(t.eva?.matches_plan_eva_start_utc).toBe(true);
    expect(t.eva?.plan_eva_start_utc).toBe(derived);
  });

  it("fails loudly on non-finite dwell, EVA duration and walk times, naming the field", () => {
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ dwell: Number.NaN }) }))).toThrow(/dwell_min_per_stop/);
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ maxH: Number.POSITIVE_INFINITY }) }))).toThrow(/max_eva_duration_h/);
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ walk0: Number.NaN }) }))).toThrow(/legs\[0\].*walk_time_min/);
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ walk1: Number.POSITIVE_INFINITY }) }))).toThrow(/legs\[1\].*walk_time_min/);
  });

  it("fails loudly when waypoints[0] is not the start or waypoints[1], [2] are not stops", () => {
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ roles: ["stop", "stop", "stop", "stop"] }) }))).toThrow(/waypoints\[0\].*start/);
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ roles: ["start", "start", "stop", "stop"] }) }))).toThrow(/waypoints\[1\].*stop/);
    expect(() => deriveDemoTiming(inputs(A, { plan: plan({ roles: ["start", "stop", "start", "stop"] }) }))).toThrow(/waypoints\[2\].*stop/);
  });

  it("does not shift the replayed times: the alert is the same with or without a plan", () => {
    const without = deriveDemoTiming(inputs(A));
    const withPlan = deriveDemoTiming(inputs(A, { plan: plan() }));
    expect(withPlan.alert).toEqual(without.alert);
    expect(without.eva).toBeNull();
  });
});

describe("T21.15 (a) helpers and determinism", () => {
  it("is pure: repeated calls give equal results and do not touch the inputs", () => {
    const i = inputs(NOON_ALERT_MS, { plan: plan() });
    const before = JSON.stringify(i);
    const a = deriveDemoTiming(i);
    const b = deriveDemoTiming(i);
    expect(a).toEqual(b);
    expect(JSON.stringify(i)).toBe(before);
  });

  it("parseHabSite reads the first-choice latitude and longitude, accepting the Unicode minus", () => {
    const md = [
      "| | First choice | Alternative |",
      "| --- | --- | --- |",
      "| Lat, lon °E | −1.5, 99.25 | −2.5, 100.5 |",
      "",
    ].join("\n");
    expect(parseHabSite(md, "x/hab-site.md")).toEqual({ lat: -1.5, lonE: 99.25, source: { path: "x/hab-site.md", row: "Lat, lon °E (first choice)" } });
    expect(parseHabSite(md.replace("−1.5", "1.5"), "x").lat).toBe(1.5);
  });

  it("parseHabSite fails loudly when the row is missing or malformed", () => {
    expect(() => parseHabSite("no table here", "x")).toThrow(/Lat, lon/);
    expect(() => parseHabSite("| Lat, lon °E | abc, def | q |", "x")).toThrow(/first-choice/);
  });

  it("formatMarkdown names every value with its source path and row", () => {
    const md = formatMarkdown(deriveDemoTiming(inputs(NOON_ALERT_MS, { plan: plan() })));
    for (const needle of ["synthetic/dose_series.json", "synthetic/earth_link.json", "row 3", "eva_start_utc", "hab-site.md"]) expect(md).toContain(needle);
  });

  it("formatMarkdown prints the Y source as passes[i] only, and fixed decimals next to the exact value", () => {
    const A = NOON_ALERT_MS;
    const passes = [{ orbiter: "tgo" as const, start_utc: iso(A + 45 * MIN + 20_000), end_utc: iso(A + 55 * MIN), max_elev_deg: 30 }];
    const t = deriveDemoTiming(inputs(A, { earth_link: { path: "synthetic/e.json", data: table(A - 5 * MIN, 12, passes) } }));
    const md = formatMarkdown(t);
    expect(md).toContain("synthetic/e.json passes[0]");
    expect(md).not.toMatch(/row 0 passes\[0\]/);
    expect(md).toContain(`${t.light_time.light_time_min.toFixed(2)} min`);
    expect(md).toContain(String(t.light_time.light_time_min));
    expect(md).toContain(`${t.next_pass!.wait_min.toFixed(1)} min`);
    expect(md).toContain(String(t.next_pass!.wait_min));
    // JSON stays unrounded
    expect(t.next_pass!.wait_min).toBe(45 + 20 / 60);
  });
});

describe("T21.15 (a) docs claims in 01 §E.1", () => {
  const section = (body: string): string => `### E.1 Killer demo\n\n${body}\n\n### E.2 Supporting scenario\n\nLight time X min elsewhere.`;

  it("xy_pending while the X / Y placeholders are there", () => {
    expect(parseE1Claims(section("| 0:20 | Earth link widget: light time X min (SPICE), next relay pass in Y min |")).xy_pending).toBe(true);
  });

  it("xy_pending while only one placeholder is left", () => {
    expect(parseE1Claims(section("| 0:20 | light time 14.2 min, next relay pass in Y min |")).xy_pending).toBe(true);
    expect(parseE1Claims(section("| 0:20 | light time X min, next relay pass in 31 min |")).xy_pending).toBe(true);
  });

  it("the 'illustrative' note does not gate the X / Y comparison (it also covers T23.08's ETAs and slope)", () => {
    const md = section("| 0:20 | light time 14.2 min, next relay pass in 31 min |\n\nTimes in this table are **illustrative**.");
    const claims = parseE1Claims(md);
    expect(claims.xy_pending).toBe(false);
    expect(claims.illustrative).toBe(true);
    expect(claims).toMatchObject({ light_time_min: 14.2, next_pass_min: 31 });
  });

  it("reads the stated values once the placeholders and the note are gone, ignoring other sections", () => {
    const claims = parseE1Claims(section("| 0:20 | Earth link widget: light time 14.2 min (SPICE), next relay pass in 31 min |"));
    expect(claims).toEqual({ xy_pending: false, illustrative: false, light_time_min: 14.2, next_pass_min: 31 });
  });

  it("ends the section at any heading level 1 to 3", () => {
    const md = "### E.1 Killer demo\n\nlight time 14.2 min, next relay pass in 31 min\n\n## F. Next part\n\nlight time X min here";
    expect(parseE1Claims(md).xy_pending).toBe(false);
    const md2 = "### E.1 Killer demo\n\nlight time 14.2 min, next relay pass in 31 min\n\n# Top\n\nY min here";
    expect(parseE1Claims(md2).xy_pending).toBe(false);
  });

  it("fails loudly when the section is missing", () => {
    expect(() => parseE1Claims("# nothing")).toThrow(/E\.1/);
  });
});

describe("T21.15 (a) CLI entry guard (M1)", () => {
  it("isMainModule is true through a symlinked path to the same file, false for another file", () => {
    const dir = mkdtempSync(join(tmpdir(), "demo-numbers-"));
    const link = join(dir, "link.ts");
    symlinkSync(join(ROOT, "apps/hab-core/scripts/demo-numbers.ts"), link);
    const real = pathToFileURL(join(ROOT, "apps/hab-core/scripts/demo-numbers.ts")).href;
    expect(isMainModule(real, link)).toBe(true);
    expect(isMainModule(real, join(ROOT, "apps/hab-core/package.json"))).toBe(false);
    expect(isMainModule(real, undefined)).toBe(false);
  });

  it("running the script through a symlinked directory prints the JSON, not nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "demo-numbers-dir-"));
    const linkedRoot = join(dir, "repo");
    symlinkSync(ROOT, linkedRoot);
    const out = execFileSync(join(ROOT, "node_modules/.bin/tsx"), [join(linkedRoot, "apps/hab-core/scripts/demo-numbers.ts")], { encoding: "utf8", cwd: ROOT });
    expect(out.startsWith("{")).toBe(true);
    expect(out).toContain('"alert"');
  });
});

// ---------------------------------------------------------------------------
// (b) The real committed tables, as file snapshots
// ---------------------------------------------------------------------------

describe("T21.15 (b) real committed tables", () => {
  const real = loadInputs(ROOT, { withPlan: false });
  const timing = deriveDemoTiming(real);

  it("derived alert, LTST, sunrise / sunset, X and Y are stored as a file snapshot", async () => {
    const stored = {
      hab: { lat: real.hab.lat, lonE: real.hab.lonE, source: real.hab.source },
      alert: timing.alert,
      sun: timing.sun,
      light_time: timing.light_time,
      next_pass: timing.next_pass,
      alert_inside_pass: timing.alert_inside_pass,
    };
    await expect(`${JSON.stringify(stored, null, 2)}\n`).toMatchFileSnapshot("./__snapshots__/demoNumbers.alert.snap");
  });

  it("every derived value names a committed table and a row", () => {
    expect(timing.alert.source.path).toBe("scenarios/storm-sol4190/dose_series.json");
    expect(timing.light_time.source.path).toBe("scenarios/storm-sol4190/earth_link.json");
    expect(timing.alert.source.row).toBeGreaterThan(0);
    expect(timing.light_time.source.row).toBeGreaterThanOrEqual(0);
    expect(timing.light_time.light_time_min).toBeGreaterThan(0);
  });

  it("the first alert sample is the one triggerState reports first, with the committed ParamSet", () => {
    const s = real.dose_series.data;
    const i = timing.alert.source.row;
    expect(triggerState(s, s.samples[i][0], real.alert_params.data)).toBe("alert");
    expect(triggerState(s, s.samples[i - 1][0], real.alert_params.data)).toBe("nominal");
  });

  it("the derivation is a fixed function of the tables (repeat run gives the same result)", () => {
    expect(deriveDemoTiming(loadInputs(ROOT, { withPlan: false }))).toEqual(timing);
  });
});

// ---------------------------------------------------------------------------
// (c) Part (b) of the rule against the real plan.json (T21.12)
// ---------------------------------------------------------------------------

describe("T21.15 (c) stop-2 dwell rule on the real plan.json", () => {
  it.skipIf(!existsSync(PLAN_FILE))("derives eva_start_utc, all asserts pass, stored as a file snapshot", async () => {
    const timing = deriveDemoTiming(loadInputs(ROOT));
    expect(timing.eva).not.toBeNull();
    await expect(`${JSON.stringify(timing.eva, null, 2)}\n`).toMatchFileSnapshot("./__snapshots__/demoNumbers.eva.snap");
  });

  it.skipIf(existsSync(PLAN_FILE))("is reported as absent, not faked, when plan.json is missing", () => {
    expect(deriveDemoTiming(loadInputs(ROOT)).eva).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (d) Docs-consistency against 01 §E.1
// ---------------------------------------------------------------------------

describe("T21.15 (d) 01 §E.1 states the derived values", () => {
  const claims = parseE1Claims(readFileSync(SPEC_01, "utf8"));

  it("guard: once the X / Y placeholders are gone, both stated values can be read, so the comparison below runs", () => {
    // The comparison is gated only on the X / Y placeholders. If they are gone but the numbers are not in the
    // 'light time <n> min' / 'next relay pass in <n> min' form, this fails instead of the comparison silently skipping.
    if (!claims.xy_pending) {
      expect(claims.light_time_min, "01 §E.1 has no 'light time <n> min'").toBeDefined();
      expect(claims.next_pass_min, "01 §E.1 has no 'next relay pass in <n> min'").toBeDefined();
    }
  });

  it.skipIf(claims.xy_pending)("the light time and the wait for the next pass equal the derived values at the precision written", () => {
    const timing = deriveDemoTiming(loadInputs(ROOT, { withPlan: false }));
    const decimals = (n: number): number => (String(n).split(".")[1] ?? "").length;
    const round = (x: number, d: number): number => Number(x.toFixed(d));
    expect(claims.light_time_min).toBeDefined();
    expect(claims.next_pass_min).toBeDefined();
    expect(claims.light_time_min).toBe(round(timing.light_time.light_time_min, decimals(claims.light_time_min!)));
    expect(timing.next_pass).not.toBeNull();
    expect(claims.next_pass_min).toBe(round(timing.next_pass!.wait_min, decimals(claims.next_pass_min!)));
  });
});
