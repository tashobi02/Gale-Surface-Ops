/**
 * T21.12 (TASK-21; FR-34, NFR-06; 06 §D.1; BD-106, BD-142, BD-144): build the demo `PlanExport` headlessly. A thin layer
 * over `@marswalk/compute`: it loads the site's real grid, resolves the demo stops (`apps/web/src/ui/demoPlan.json`, BD-106)
 * against the site's POIs, runs the same `handleWorkerMessage` the planner worker runs, and writes the export. It has no
 * science of its own, no typed numbers and no wall-clock time: the export carries no `computed_utc` or `timing_ms`
 * (the schema leaves both optional), so two runs give the same bytes.
 *
 * Three decisions it applies, each from data:
 * - the hard slope limit (BD-142): from the demo plan file's value, raised in whole degrees up to the plan-export schema's
 *   maximum, to the smallest limit at which every leg routes (four of the five POIs sit on 22 to 24.5 deg cells, BD-140);
 * - the start time (T21.15, stop-2 dwell rule decided by Sadman Shaharier Mahim, 2026-11-10): pass 1 routes the plan with the
 *   first dose sample's time as a placeholder start, `deriveDemoTiming` gives the start, pass 2 writes it. The walk times
 *   must not change between the passes (they do not depend on the start), or the script throws;
 * - the hash: first 12 hex of SHA-256 over the RFC 8785 JSON of `{data_version, scenario, waypoints}` (05 PlanExport), the
 *   rule the web app and the Hab Core loader apply.
 *
 * Run: `npm --workspace @marswalk/hab-core run build-demo-plan` (writes scenarios/storm-sol4190/plan.json and prints a
 * summary; `-- --out <file>` writes elsewhere; `-- --check` writes nothing and fails if the committed file would change).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handleWorkerMessage, type PurePlanResultMessage } from "@marswalk/compute";
import type { ComputePlanRequest, MissionScenario, PlanExport, Provenance, Waypoint } from "@marswalk/protocol";
import { canonicalJson } from "../src/log";
import { loadSite } from "../src/scenario";
import { deriveDemoTiming, loadInputs, type DemoTiming } from "./demo-numbers";

/** The prototype disclaimer (01 §F.1, FD-135). Equal to `PROTOTYPE_DISCLAIMER` in apps/web/src/export/planExport.ts (a test compares them). */
export const PROTOTYPE_DISCLAIMER =
  "Marswalk Surface Ops is an exploratory hackathon prototype. It is not astronaut operations software. " +
  "Crew, suit, rover and vehicle states are simulated. Solar events are real historical records replayed " +
  "on a simulated clock — not a live feed from Mars. Slope limits, speeds, consumables and shelter values " +
  "are illustrative assumptions from Earth and Apollo-era references. Radio coverage is line-of-sight only.";

/** The version of `schemas/plan-export.schema.json` this file implements (as the web app's EXPORT_SCHEMA_VERSION, FD-140). */
const EXPORT_SCHEMA_VERSION = "1.0.0";
/** The hard slope limit steps in whole degrees (02 §E.3 shows whole degrees). */
const LIMIT_STEP_DEG = 1;

export const DEMO_PLAN_PATH = "apps/web/src/ui/demoPlan.json";
export const PLAN_PATH = "scenarios/storm-sol4190/plan.json";
const SCHEMA_PATH = "schemas/plan-export.schema.json";
const PROVENANCE_MAP_PATH = "apps/web/src/ui/content/provenanceMap.json";
const WEB_PACKAGE_PATH = "apps/web/package.json";

export interface DemoPlanFile {
  start: string;
  stops: string[];
  scenario: Omit<MissionScenario, "eva_start_utc">;
}

export interface PoiPoint {
  poi_id: string;
  name: string;
  x_m: number;
  y_m: number;
}

/** wp-0 is the site's default start; wp-n is the nth demo stop with its POI id. A stop the site lacks throws: no coordinate is invented. */
export function resolveDemoWaypoints(start: { x_m: number; y_m: number; label: string }, pois: PoiPoint[], stops: string[]): Waypoint[] {
  if (stops.length === 0) throw new Error("resolveDemoWaypoints: the demo plan has no stops");
  const waypoints: Waypoint[] = [{ id: "wp-0", role: "start", x_m: start.x_m, y_m: start.y_m, label: start.label.slice(0, 40) }];
  stops.forEach((poiId, i) => {
    const poi = pois.find((p) => p.poi_id === poiId);
    if (!poi) throw new Error(`resolveDemoWaypoints: demo stop ${poiId} is not a POI of the site`);
    waypoints.push({ id: `wp-${i + 1}`, role: "stop", x_m: poi.x_m, y_m: poi.y_m, label: poi.name.slice(0, 40), poi_id: poiId });
  });
  return waypoints;
}

/**
 * BD-142: the smallest limit from `from` to `max` (whole degrees) at which no leg is NO_ROUTE. An OVER_LIMITS plan still
 * routes. Throws RangeError for `from` above `max` and an Error naming both limits when none routes.
 */
export function smallestRoutableLimit(from: number, max: number, route: (limit: number) => { status: string; legs: { status: string }[] }): number {
  if (!(from <= max)) throw new RangeError(`smallestRoutableLimit: starting limit ${from} is above the maximum ${max}`);
  for (let limit = from; limit <= max; limit += LIMIT_STEP_DEG) {
    if (route(limit).legs.every((l) => l.status !== "NO_ROUTE")) return limit;
  }
  throw new Error(`smallestRoutableLimit: no hard slope limit from ${from} to ${max} deg routes every leg`);
}

/** First 12 hex of SHA-256 over the RFC 8785 JSON of `{data_version, scenario, waypoints}` (05 PlanExport). */
export function planHashOf(data_version: string, scenario: MissionScenario, waypoints: Waypoint[]): string {
  return createHash("sha256").update(canonicalJson({ data_version, scenario, waypoints })).digest("hex").slice(0, 12);
}

export interface BuildOptions {
  root: string;
  siteDir?: string;
  stops?: string[];
  scenario?: Omit<MissionScenario, "eva_start_utc">;
  /** The EVA start; absent: derived by the T21.15 rule (the real demo's case). */
  startUtc?: string;
  /** Use the scenario's own hard limit as given (no search). */
  fixedLimit?: boolean;
}

export interface BuildResult {
  plan: PlanExport;
  search: { from_deg: number; limit_deg: number; max_deg: number };
  timing: DemoTiming | null;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/** The `maximum` of `hard_slope_limit_deg` in the plan-export schema (read, never typed; as the pipeline validator does, BD-140). */
function maxLimitDeg(root: string): number {
  const schema = readJson<{ $defs: { MissionScenario: { properties: { hard_slope_limit_deg: { maximum: number } } } } }>(join(root, SCHEMA_PATH));
  return schema.$defs.MissionScenario.properties.hard_slope_limit_deg.maximum;
}

function poisOf(siteDir: string, manifest: { pois_asset: string; assets: { asset_id: string; path: string }[] }): PoiPoint[] {
  const asset = manifest.assets.find((a) => a.asset_id === manifest.pois_asset);
  if (!asset) throw new Error(`the site manifest lists no asset ${manifest.pois_asset}`);
  const fc = readJson<{ features: { geometry: { coordinates: [number, number] }; properties: { poi_id: string; name: string } }[] }>(join(siteDir, asset.path));
  return fc.features.map((f) => ({ poi_id: f.properties.poi_id, name: f.properties.name, x_m: f.geometry.coordinates[0], y_m: f.geometry.coordinates[1] }));
}

/** The shared provenance table (FD-136) applied as the web app's `provenanceSummary` does: only values the export carries. */
function provenanceSummary(root: string, plan: Pick<PlanExport, "result" | "scenario">): PlanExport["provenance_summary"] {
  const map = readJson<{ result: Record<string, { provenance: string; source_ids: string[] }>; scenario: Record<string, { provenance: string; source_ids: string[] }> }>(join(root, PROVENANCE_MAP_PATH));
  return Object.entries({ ...map.result, ...map.scenario })
    .filter(([path]) => path.split(".").reduce<unknown>((v, key) => (v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined), plan) != null)
    .map(([value_path, entry]) => ({ value_path, provenance: entry.provenance as Provenance, source_ids: [...entry.source_ids] }));
}

/** Build the export. Pure given the files under `root`; no clock. */
export function buildDemoPlan(opts: BuildOptions): BuildResult {
  const { root } = opts;
  const siteDir = opts.siteDir ?? join(root, "data/sites/gale_boxwork");
  const demo = readJson<DemoPlanFile>(join(root, DEMO_PLAN_PATH));
  const stops = opts.stops ?? demo.stops;
  const base = opts.scenario ?? demo.scenario;
  const manifestFile = readJson<{ site_id: string; data_version: string; pois_asset: string; assets: { asset_id: string; path: string }[]; }>(join(siteDir, "site-manifest.json"));
  const { grid, manifest } = loadSite(siteDir, manifestFile.site_id, manifestFile.data_version);
  const waypoints = resolveDemoWaypoints(manifest.default_start, poisOf(siteDir, manifestFile), stops);
  const envConstants = manifest.env_constants;

  const route = (scenario: MissionScenario) => {
    const request: ComputePlanRequest = { type: "COMPUTE_PLAN", request_id: "build-demo-plan", plan_revision: 1, site_id: manifest.site_id, data_version: manifest.data_version, scenario, waypoints };
    const res = handleWorkerMessage(grid, request, undefined, { envConstants });
    if (res.type !== "PLAN_RESULT") throw new Error(`build-demo-plan: the compute core answered ${res.type}: ${res.type === "ERROR" ? res.message : ""}`);
    return res;
  };

  const doseFirst = readJson<{ samples: [string, number | null][] }>(join(root, "scenarios/storm-sol4190/dose_series.json")).samples[0]![0];
  const placeholder = opts.startUtc ?? doseFirst;
  const withStart = (limit: number, eva_start_utc: string): MissionScenario => ({ ...base, hard_slope_limit_deg: limit, eva_start_utc });

  const max = maxLimitDeg(root);
  const from = base.hard_slope_limit_deg;
  const limit = opts.fixedLimit ? from : smallestRoutableLimit(from, max, (l) => route(withStart(l, placeholder)));

  let start = placeholder;
  let timing: DemoTiming | null = null;
  let result = route(withStart(limit, placeholder));
  if (opts.startUtc === undefined) {
    const planSlice = { scenario: withStart(limit, placeholder), waypoints, result };
    timing = deriveDemoTiming({ ...loadInputs(root, { withPlan: false }), plan: planSlice });
    start = timing.eva!.eva_start_utc;
    const second = route(withStart(limit, start));
    const walk = (r: PurePlanResultMessage): (number | null)[] => r.legs.map((l) => (l.status === "OK" ? l.walk_time_min : null));
    if (JSON.stringify(walk(second)) !== JSON.stringify(walk(result))) throw new Error("build-demo-plan: the leg walk times changed with the EVA start time; the T21.15 rule needs them fixed");
    result = second;
  }

  const scenario = withStart(limit, start);
  const { type: _type, request_id: _id, plan_revision: _rev, ...pure } = result;
  const exportResult = pure as unknown as PlanExport["result"];
  const plan: PlanExport = {
    export_schema_version: EXPORT_SCHEMA_VERSION,
    app_version: readJson<{ version: string }>(join(root, WEB_PACKAGE_PATH)).version,
    site_id: manifest.site_id,
    data_version: manifest.data_version,
    plan_hash: planHashOf(manifest.data_version, scenario, waypoints),
    scenario,
    waypoints,
    result: exportResult,
    provenance_summary: [],
    disclaimer: PROTOTYPE_DISCLAIMER,
  };
  plan.provenance_summary = provenanceSummary(root, plan);
  return { plan, search: { from_deg: from, limit_deg: limit, max_deg: max }, timing };
}

/** The file text: 2-space JSON and one final newline. */
export const planJson = (plan: PlanExport): string => `${JSON.stringify(plan, null, 2)}\n`;

function isMainModule(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argv1);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const root = join(dirname(realpathSync(fileURLToPath(import.meta.url))), "../../..");
    const arg = (name: string): string | undefined => {
      const i = process.argv.indexOf(`--${name}`);
      return i >= 0 ? process.argv[i + 1] : undefined;
    };
    const out = arg("out") ?? join(root, PLAN_PATH);
    const { plan, search, timing } = buildDemoPlan({ root });
    const text = planJson(plan);
    if (process.argv.includes("--check")) {
      if (!existsSync(out) || readFileSync(out, "utf8") !== text) throw new Error(`${out} is not what build-demo-plan builds (plan_hash ${plan.plan_hash}); rebuild it`);
    } else {
      writeFileSync(out, text);
    }
    const legs = plan.result.legs.map((l) => (l.status === "OK" ? `${l.walk_time_min.toFixed(1)} min` : l.status));
    process.stdout.write(
      [
        `plan_hash ${plan.plan_hash}`,
        `hard_slope_limit_deg ${search.limit_deg} (the demo file says ${search.from_deg}; BD-142: smallest limit at which every leg routes, up to ${search.max_deg})`,
        `eva_start_utc ${plan.scenario.eva_start_utc}${timing?.eva ? ` (T21.15: ${timing.eva.source.rule})` : ""}`,
        `legs ${legs.join(", ")}; status ${plan.result.status}`,
        `wrote ${out}`,
        "",
      ].join("\n"),
    );
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
}
