/**
 * T21.15 (TASK-21; FR-34, FR-37, FR-38, FR-43; 01 §E.1): derive the demo timing numbers from the
 * committed tables. A thin orchestration layer over `@marswalk/compute`: it selects rows and calls
 * compute; it has no science of its own, no typed numbers and no wall-clock time (NFR-06). `Date` is
 * used only to turn an ISO string into epoch milliseconds and back (and for whole-minute arithmetic).
 *
 * What it derives, each with its source path and row or index:
 * - the first `alert` sample: `triggerState` over `dose_series.json` with the `alert-assumed` ParamSet;
 * - the local true solar time, sun elevation, sunrise and sunset at the alert (`localTrueSolarTime`,
 *   `solarPosition`, `sunriseSunset`; hab lat / lon °E from `docs/ops/feasibility/hab-site.md`,
 *   TODO(decision): read them from the site manifest once it carries geographic coordinates);
 * - the light time X: the `earth_link.json` row at or before the alert;
 * - the next relay pass Y: the first pass with `start_utc` >= alert, and "alert inside pass" as a
 *   separate field. TODO(T05b.13): switch to `nextPassStart` and `linkAt` (both still stubs in
 *   `packages/compute/src/earthLink.ts`; the row and pass selection here is table lookup only);
 * - when a plan is given, `eva_start_utc` by the stop-2 dwell rule (decided by Sadman Shaharier Mahim,
 *   2026-11-10): start = alert - (legs[0].walk_time_min + dwell + legs[1].walk_time_min + dwell / 2),
 *   in minutes, rounded down to a whole UTC minute, with its asserts. A miss throws; the replayed times
 *   are never shifted.
 *
 * Run: `npm --workspace @marswalk/hab-core run demo-numbers`.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localTrueSolarTime, solarPosition, sunriseSunset, triggerState } from "@marswalk/compute";
import type { DoseSeries, EarthLinkTable, MissionScenario, NoRouteLeg, OkLeg, ParamSet, Waypoint } from "@marswalk/protocol";

const MIN_MS = 60_000;
/** Daylight margin of the stop-2 rule: 1 min, the 02 §D.5 LTST tolerance. */
const DAYLIGHT_MARGIN_MIN = 1;

export const SCENARIO_DIR = "scenarios/storm-sol4190";
export const PATHS = {
  dose_series: `${SCENARIO_DIR}/dose_series.json`,
  alert_params: `${SCENARIO_DIR}/param_sets/alert-assumed.json`,
  earth_link: `${SCENARIO_DIR}/earth_link.json`,
  plan: `${SCENARIO_DIR}/plan.json`,
  hab_site: "docs/ops/feasibility/hab-site.md",
  spec_01: "docs/specs/01_Product_Requirements_Document.md",
} as const;

export interface Sourced<T> {
  path: string;
  data: T;
}

export interface HabSite {
  lat: number;
  lonE: number;
  source: { path: string; row: string };
}

/** The part of a PlanExport the rule reads (05 PlanExport: scenario, waypoints, result.legs). */
export interface PlanSlice {
  scenario: Pick<MissionScenario, "dwell_min_per_stop" | "max_eva_duration_h" | "eva_start_utc">;
  waypoints: Pick<Waypoint, "id" | "role">[];
  result: { legs: (Pick<OkLeg, "from" | "to" | "status" | "walk_time_min"> | Pick<NoRouteLeg, "from" | "to" | "status">)[] };
}

export interface DemoTimingInputs {
  dose_series: Sourced<DoseSeries>;
  alert_params: Sourced<ParamSet>;
  earth_link: Sourced<EarthLinkTable>;
  hab: HabSite;
  /** Absent until T21.12 writes plan.json; part (b) is then reported as `eva: null`. */
  plan?: PlanSlice;
  plan_path?: string;
}

interface Source {
  path: string;
  row: number;
}

export interface PassFinding {
  orbiter: string;
  start_utc: string;
  end_utc: string;
  max_elev_deg: number;
  /** Minutes from the alert to the start of the pass (0 when it starts at the alert). */
  wait_min: number;
  source: Source;
}

export interface DemoTiming {
  hab: HabSite;
  alert: {
    t_utc: string;
    ltst: string;
    sun_elevation_deg: number;
    is_daylight: boolean;
    source: Source & { rule: string };
  };
  sun: { sunrise_utc: string; sunset_utc: string; sunrise_ltst: string; sunset_ltst: string; source: { rule: string } };
  light_time: { row_t_utc: string; light_time_s: number; light_time_min: number; source: Source };
  next_pass: PassFinding | null;
  alert_inside_pass: PassFinding | null;
  eva: {
    eva_start_utc: string;
    ltst: string;
    sun_elevation_deg: number;
    walk_leg0_min: number;
    walk_leg1_min: number;
    dwell_min: number;
    arr2_min: number;
    /** Minutes subtracted from the alert before the floor: arr2 + dwell / 2. */
    offset_min: number;
    max_eva_duration_h: number;
    eva_end_utc: string;
    plan_eva_start_utc: string | null;
    matches_plan_eva_start_utc: boolean;
    source: { path: string; rule: string };
  } | null;
}

/** ISO time with an explicit Z or ±hh:mm offset, so parsing never depends on the host time zone (as compute's parseUtc). */
function ms(t_utc: string, what: string): number {
  const v = /(Z|[+-]\d{2}:\d{2})$/.test(t_utc) ? Date.parse(t_utc) : Number.NaN;
  if (Number.isNaN(v)) throw new Error(`demo-numbers: ${what} ${JSON.stringify(t_utc)} is not an ISO time with Z or an offset (±hh:mm)`);
  return v;
}

/** Epoch ms as ISO UTC without fractional seconds (the format of the committed tables). */
function iso(t_ms: number): string {
  return new Date(t_ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Display rounding only (0.01 deg); the unrounded value never feeds a decision. */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function sunAt(t_ms: number, hab: HabSite): { elevation_deg: number; ltst: string } {
  const at = new Date(t_ms);
  return { elevation_deg: round2(solarPosition(at, hab.lat, hab.lonE).elevation_deg), ltst: localTrueSolarTime(at, hab.lonE) };
}

function firstAlertRow(series: DoseSeries, params: ParamSet): number {
  for (let i = 0; i < series.samples.length; i++) {
    if (triggerState(series, series.samples[i][0], params) === "alert") return i;
  }
  throw new Error(`demo-numbers: no alert sample in series ${series.series_id} with ParamSet ${params.param_set_id}`);
}

/** Index of the last row with t <= alert (binary search; rows are strictly increasing). */
function lightTimeRow(table: EarthLinkTable, alert_ms: number): number {
  const rows = table.rows;
  if (rows.length === 0) throw new Error("demo-numbers: earth link table has no rows");
  if (ms(rows[0].t_utc, "row time") > alert_ms) throw new Error(`demo-numbers: the alert ${iso(alert_ms)} is before the first row ${rows[0].t_utc} of the earth link table`);
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ms(rows[mid].t_utc, "row time") <= alert_ms) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function passFinding(table: EarthLinkTable, index: number, alert_ms: number, path: string): PassFinding {
  const p = table.passes[index];
  return { orbiter: p.orbiter, start_utc: p.start_utc, end_utc: p.end_utc, max_elev_deg: p.max_elev_deg, wait_min: (ms(p.start_utc, "pass start") - alert_ms) / MIN_MS, source: { path, row: index } };
}

/** The pure derivation. Throws, with the failing rule named, on any miss. */
export function deriveDemoTiming(inputs: DemoTimingInputs): DemoTiming {
  const { hab } = inputs;
  const series = inputs.dose_series.data;
  const table = inputs.earth_link.data;

  // (a) alert, then the conditions at the alert
  const alertRow = firstAlertRow(series, inputs.alert_params.data);
  const alert_utc = series.samples[alertRow][0];
  const alert_ms = ms(alert_utc, "alert sample");
  const alertSun = sunAt(alert_ms, hab);
  const events = sunriseSunset(new Date(alert_ms), hab.lat, hab.lonE);

  const alert: DemoTiming["alert"] = {
    t_utc: alert_utc,
    ltst: alertSun.ltst,
    sun_elevation_deg: alertSun.elevation_deg,
    is_daylight: alertSun.elevation_deg > 0,
    source: { path: inputs.dose_series.path, row: alertRow, rule: `triggerState with ParamSet ${inputs.alert_params.data.param_set_id} (${inputs.alert_params.path})` },
  };
  const sun: DemoTiming["sun"] = { ...events, source: { rule: `sunriseSunset(alert, lat, lonE) with the hab position from ${hab.source.path}` } };

  // X: the row at or before the alert
  const xRow = lightTimeRow(table, alert_ms);
  const light_time: DemoTiming["light_time"] = {
    row_t_utc: table.rows[xRow].t_utc,
    light_time_s: table.rows[xRow].light_time_s,
    light_time_min: table.rows[xRow].light_time_s / 60,
    source: { path: inputs.earth_link.path, row: xRow },
  };

  // Y: the first pass with start >= alert (TODO(T05b.13): nextPassStart); the pass the alert is inside, apart
  let nextIndex = -1;
  let insideIndex = -1;
  table.passes.forEach((p, i) => {
    const start = ms(p.start_utc, "pass start");
    const end = ms(p.end_utc, "pass end");
    if (start >= alert_ms && (nextIndex < 0 || start < ms(table.passes[nextIndex].start_utc, "pass start"))) nextIndex = i;
    if (start <= alert_ms && alert_ms < end && insideIndex < 0) insideIndex = i;
  });
  const next_pass = nextIndex < 0 ? null : passFinding(table, nextIndex, alert_ms, inputs.earth_link.path);
  const alert_inside_pass = insideIndex < 0 ? null : passFinding(table, insideIndex, alert_ms, inputs.earth_link.path);

  return { hab, alert, sun, light_time, next_pass, alert_inside_pass, eva: inputs.plan ? stopTwoStart(inputs.plan, inputs.hab, inputs.plan_path ?? PATHS.plan, alert_ms, events) : null };
}

/** Part (b): the stop-2 dwell rule and its asserts. */
function stopTwoStart(plan: PlanSlice, hab: HabSite, plan_path: string, alert_ms: number, events: { sunrise_utc: string; sunset_utc: string }): NonNullable<DemoTiming["eva"]> {
  const [leg0, leg1] = plan.result.legs;
  for (const [i, leg] of [leg0, leg1].entries()) {
    if (!leg || leg.status !== "OK") throw new Error(`demo-numbers: result.legs[${i}] must exist and have status OK`);
    if (!Number.isFinite(leg.walk_time_min)) throw new Error(`demo-numbers: result.legs[${i}].walk_time_min is not a finite number`);
  }
  const ok0 = leg0 as Pick<OkLeg, "from" | "to" | "walk_time_min">;
  const ok1 = leg1 as Pick<OkLeg, "from" | "to" | "walk_time_min">;
  const [wp0, wp1, stop2] = plan.waypoints;
  if (!stop2) throw new Error("demo-numbers: the plan has no waypoints[2] (the second stop)");
  if (wp0.role !== "start") throw new Error(`demo-numbers: waypoints[0] ${wp0.id} must have role start, not ${wp0.role}`);
  if (wp1.role !== "stop") throw new Error(`demo-numbers: waypoints[1] ${wp1.id} must have role stop, not ${wp1.role}`);
  if (stop2.role !== "stop") throw new Error(`demo-numbers: waypoints[2] ${stop2.id} must have role stop, not ${stop2.role}`);
  if (ok1.to !== stop2.id) throw new Error(`demo-numbers: result.legs[1].to is ${ok1.to}, not waypoints[2] (${stop2.id}), the second stop`);
  if (!Number.isFinite(plan.scenario.dwell_min_per_stop)) throw new Error("demo-numbers: scenario.dwell_min_per_stop is not a finite number");
  if (!Number.isFinite(plan.scenario.max_eva_duration_h)) throw new Error("demo-numbers: scenario.max_eva_duration_h is not a finite number");
  const dwell = plan.scenario.dwell_min_per_stop;
  const arr2 = ok0.walk_time_min + dwell + ok1.walk_time_min;
  const offset = arr2 + dwell / 2;
  const start_ms = Math.floor((alert_ms - offset * MIN_MS) / MIN_MS) * MIN_MS;

  const gap_min = (alert_ms - start_ms) / MIN_MS;
  if (!(arr2 <= gap_min && gap_min < arr2 + dwell)) {
    throw new Error(`demo-numbers: dwell window missed: alert - start = ${gap_min} min is not in [${arr2}, ${arr2 + dwell}) (arrival at stop 2 to departure)`);
  }

  const sunrise_ms = ms(events.sunrise_utc, "sunrise");
  const sunset_ms = ms(events.sunset_utc, "sunset");
  const margin = DAYLIGHT_MARGIN_MIN * MIN_MS;
  const end_ms = start_ms + plan.scenario.max_eva_duration_h * 60 * MIN_MS;
  if (start_ms < sunrise_ms + margin) throw new Error(`demo-numbers: daylight: EVA start ${iso(start_ms)} is before sunrise ${events.sunrise_utc} + ${DAYLIGHT_MARGIN_MIN} min`);
  if (end_ms + margin > sunset_ms) throw new Error(`demo-numbers: daylight: EVA end ${iso(end_ms)} (start + max_eva_duration_h) is after sunset ${events.sunset_utc} - ${DAYLIGHT_MARGIN_MIN} min`);

  const startSun = sunAt(start_ms, hab);
  const planStart = typeof plan.scenario.eva_start_utc === "string" ? plan.scenario.eva_start_utc : null;
  return {
    eva_start_utc: iso(start_ms),
    ltst: startSun.ltst,
    sun_elevation_deg: startSun.elevation_deg,
    walk_leg0_min: ok0.walk_time_min,
    walk_leg1_min: ok1.walk_time_min,
    dwell_min: dwell,
    arr2_min: arr2,
    offset_min: offset,
    max_eva_duration_h: plan.scenario.max_eva_duration_h,
    eva_end_utc: iso(end_ms),
    plan_eva_start_utc: planStart,
    matches_plan_eva_start_utc: planStart !== null && ms(planStart, "plan eva_start_utc") === start_ms,
    source: { path: plan_path, rule: "stop-2 dwell rule: start = alert - (legs[0].walk_time_min + dwell + legs[1].walk_time_min + dwell / 2), floored to the UTC minute" },
  };
}

/** First-choice hab position from the "Lat, lon °E" row of hab-site.md (first value column). */
export function parseHabSite(markdown: string, path: string): HabSite {
  const line = markdown.split("\n").find((l) => /^\|\s*Lat, lon °E\s*\|/.test(l));
  if (!line) throw new Error(`demo-numbers: no "Lat, lon °E" row in ${path}`);
  const cell = line.split("|")[2] ?? "";
  const [lat, lonE] = cell.replace(/−/g, "-").split(",").map((s) => Number(s.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lonE) || cell.split(",").length !== 2) throw new Error(`demo-numbers: the first-choice "Lat, lon °E" cell in ${path} is not "lat, lon": ${JSON.stringify(cell.trim())}`);
  return { lat, lonE, source: { path, row: "Lat, lon °E (first choice)" } };
}

/**
 * What 01 §E.1 states for X and Y. `xy_pending` (an "X min" or "Y min" placeholder is left) is the only gate of the
 * X / Y comparison. `illustrative` (the note also covers T23.08's ETAs and slope) is reported but does not gate it.
 */
export function parseE1Claims(markdown: string): { xy_pending: boolean; illustrative: boolean; light_time_min?: number; next_pass_min?: number } {
  const start = markdown.search(/^### E\.1\b/m);
  if (start < 0) throw new Error("demo-numbers: 01 has no E.1 section");
  const rest = markdown.slice(start).replace(/^[^\n]*\n?/, "");
  const next = rest.search(/^#{1,3} /m);
  const section = next < 0 ? rest : rest.slice(0, next);
  const light = /light time\s+(\d+(?:\.\d+)?)\s*min/i.exec(section);
  const pass = /next relay pass in\s+(\d+(?:\.\d+)?)\s*min/i.exec(section);
  return {
    xy_pending: /\bX min\b|\bY min\b/.test(section),
    illustrative: /illustrative/i.test(section),
    ...(light ? { light_time_min: Number(light[1]) } : {}),
    ...(pass ? { next_pass_min: Number(pass[1]) } : {}),
  };
}

/** Reads the committed files under `root`. The plan is included when `plan.json` exists. */
export function loadInputs(root: string, options: { withPlan?: boolean } = {}): DemoTimingInputs {
  const read = <T>(rel: string): Sourced<T> => ({ path: rel, data: JSON.parse(readFileSync(join(root, rel), "utf8")) as T });
  const out: DemoTimingInputs = {
    dose_series: read<DoseSeries>(PATHS.dose_series),
    alert_params: read<ParamSet>(PATHS.alert_params),
    earth_link: read<EarthLinkTable>(PATHS.earth_link),
    hab: parseHabSite(readFileSync(join(root, PATHS.hab_site), "utf8"), PATHS.hab_site),
  };
  if (options.withPlan !== false && existsSync(join(root, PATHS.plan))) {
    out.plan = read<PlanSlice>(PATHS.plan).data;
    out.plan_path = PATHS.plan;
  }
  return out;
}

const src = (s: Source): string => `${s.path} row ${s.row}`;
const passSrc = (s: Source): string => `${s.path} passes[${s.row}]`;

/** Markdown block: every value with its source path and row. */
export function formatMarkdown(t: DemoTiming): string {
  const lines: string[] = [
    "<!-- Generated by apps/hab-core/scripts/demo-numbers.ts (T21.15). Do not edit by hand. -->",
    "",
    `- Hab position: lat ${t.hab.lat}, lon ${t.hab.lonE} °E (${t.hab.source.path}, row "${t.hab.source.row}")`,
    `- First alert sample: \`${t.alert.t_utc}\` (${src(t.alert.source)}; ${t.alert.source.rule})`,
    `- Local true solar time at the alert: ${t.alert.ltst}; sun elevation ${t.alert.sun_elevation_deg}°; ${t.alert.is_daylight ? "daylight" : "NIGHT"} (localTrueSolarTime, solarPosition)`,
    `- Sunrise ${t.sun.sunrise_utc} (${t.sun.sunrise_ltst}), sunset ${t.sun.sunset_utc} (${t.sun.sunset_ltst}) (${t.sun.source.rule})`,
    `- Light time X: ${t.light_time.light_time_min.toFixed(2)} min (exact ${t.light_time.light_time_min}) = ${t.light_time.light_time_s} s (${src(t.light_time.source)}, t_utc ${t.light_time.row_t_utc})`,
  ];
  lines.push(
    t.next_pass
      ? `- Next relay pass Y: ${t.next_pass.wait_min.toFixed(1)} min (exact ${t.next_pass.wait_min}), ${t.next_pass.orbiter} ${t.next_pass.start_utc}–${t.next_pass.end_utc} (${passSrc(t.next_pass.source)})`
      : "- Next relay pass Y: none at or after the alert in the table",
    t.alert_inside_pass
      ? `- Alert inside pass ${t.alert_inside_pass.orbiter} ${t.alert_inside_pass.start_utc}–${t.alert_inside_pass.end_utc} (${passSrc(t.alert_inside_pass.source)})`
      : "- Alert inside pass: no",
  );
  if (t.eva) {
    lines.push(
      `- eva_start_utc: \`${t.eva.eva_start_utc}\` (${t.eva.source.path}; ${t.eva.source.rule}); LTST ${t.eva.ltst}, sun elevation ${t.eva.sun_elevation_deg}°`,
      `  - legs[0] ${t.eva.walk_leg0_min} min + dwell ${t.eva.dwell_min} + legs[1] ${t.eva.walk_leg1_min} min = arrival at stop 2 after ${t.eva.arr2_min} min; offset ${t.eva.offset_min} min; EVA ends ${t.eva.eva_end_utc} (max_eva_duration_h ${t.eva.max_eva_duration_h})`,
      `  - plan.scenario.eva_start_utc is ${t.eva.plan_eva_start_utc ?? "absent"}; ${t.eva.matches_plan_eva_start_utc ? "matches" : "differs: rebuild plan.json (T21.12) with the derived value"}`,
    );
  } else lines.push("- eva_start_utc: not derived; scenarios/storm-sol4190/plan.json is absent (T21.12), so part (b) of the rule waits");
  return `${lines.join("\n")}\n`;
}

/** CLI body: JSON, then the Markdown block. */
export function main(root: string, write: (s: string) => void = (s) => process.stdout.write(s)): void {
  const timing = deriveDemoTiming(loadInputs(root));
  write(`${JSON.stringify(timing, null, 2)}\n\n`);
  write(formatMarkdown(timing));
}

/** True when this module is the entry script, also through symlinked paths (both sides are resolved). */
export function isMainModule(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argv1);
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url, process.argv[1])) {
  try {
    main(join(dirname(realpathSync(fileURLToPath(import.meta.url))), "../../.."));
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
