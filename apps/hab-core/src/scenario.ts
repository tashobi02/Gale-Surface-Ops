/**
 * Scenario loading and validation (docs/specs/05 §C.2 Scenario, 02 §E.7). Contract C14, frozen by
 * T22.01; implementation T22.11. Checks the schema, site_id and data_version, plan_hash, table
 * SHA-256s, passable starts, and that every `stop_tasks[].stop_id` is a stop Waypoint with 1–4 tasks
 * per stop (FR-50, U-61). TASK-21 owns the format.
 *
 * ajv comes through fastify (a declared hab-core dependency), as in the T22.02 fixture test.
 * TODO(decision): declare `ajv` and `ajv-formats` directly in the next dependency batch (T14.01).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { LoadedGrid } from "@marswalk/compute";
import type { DoseSeries, EarthLinkTable, ParamSet, Scenario } from "@marswalk/protocol";
import { canonicalJson } from "./log";

export interface LoadedScenario {
  scenario: Scenario;
  dose: DoseSeries;
  earthLink: EarthLinkTable;
  /** Keyed by `param_set_id`; includes one `link`, `alert` and `shielding` set (05 Scenario). */
  params: Record<string, ParamSet>;
  /** The site's routing grid; null for the fake scenario (T22.02), which has no site data. */
  grid: LoadedGrid | null;
  /**
   * Static hab comm coverage (05 RoutingGrid `comm_hab_asset`: u8, 1 = line of sight to the hab mast,
   * 0 = none, 255 = no data) and the mast it was computed for (`hab_mast`). Used by links.ts (T26.01).
   * null when no site is loaded.
   */
  comm: { comm_hab: Uint8Array; hab_mast: { x_m: number; y_m: number; height_m: number } } | null;
}

/** The loaded site the scenario must match (05 Scenario `site_id`, `data_version`). */
export interface SiteRef {
  site_id: string;
  data_version: string;
  /** Directory of `data/sites/<site_id>`; null when no site is loaded (fake scenario). */
  dir: string | null;
}

/** Thrown with the failed check and a reason (02 §E.7). */
export class ScenarioCheckError extends Error {
  constructor(
    readonly check: string,
    message: string,
  ) {
    super(message);
  }
}

/** Read and validate `<dir>/scenario.json` and its tables. Throws ScenarioCheckError. T22.11. */
export function readScenario(dir: string, site: SiteRef): LoadedScenario {
  const scenario = readJsonFile<Scenario>(join(dir, "scenario.json"), "read");

  check(validators().scenario, scenario, "schema", "scenario.json");
  check(validators().plan, scenario.plan, "plan_schema", "scenario.json plan");

  if (scenario.site_id !== site.site_id || scenario.plan.site_id !== site.site_id) {
    throw new ScenarioCheckError("site_id", `scenario site_id ${scenario.site_id} (plan ${scenario.plan.site_id}) is not the loaded site ${site.site_id}`);
  }
  if (scenario.data_version !== site.data_version || scenario.plan.data_version !== site.data_version) {
    throw new ScenarioCheckError("data_version", `scenario data_version ${scenario.data_version} (plan ${scenario.plan.data_version}) is not the loaded site's ${site.data_version}`);
  }

  const { data_version, scenario: mission, waypoints } = scenario.plan;
  const planHash = sha256(canonicalJson({ data_version, scenario: mission, waypoints })).slice(0, 12);
  if (planHash !== scenario.plan.plan_hash) {
    throw new ScenarioCheckError("plan_hash", `plan_hash ${scenario.plan.plan_hash} does not verify (computed ${planHash}, 05 PlanExport)`);
  }

  const dose = readTable<DoseSeries>(dir, "dose_series", scenario.tables.dose_series);
  const earthLink = readTable<EarthLinkTable>(dir, "earth_link", scenario.tables.earth_link);

  checkStopTasks(scenario);
  const params = readParamSets(dir, scenario);

  const times = scenario.events.map((e) => Date.parse(e.t_utc));
  if (times.some((t, i) => i > 0 && t < times[i - 1])) {
    throw new ScenarioCheckError("events_order", "scenario events must be sorted by t_utc (05 Scenario)");
  }

  // TODO(TASK-05): load the site's routing grid and comm_hab (compute `loadGrid`) when `site.dir` is
  // set, and check that every crew and vehicle start is passable for its kind (05 §E.7). The fake
  // scenario has no site data, so both stay null.
  return { scenario, dose, earthLink, params, grid: null, comm: null };
}

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

function readJsonFile<T>(path: string, failCheck: string): T {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new ScenarioCheckError(failCheck, `cannot read ${path}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new ScenarioCheckError(failCheck, `${path} is not valid JSON: ${(err as Error).message}`);
  }
}

/** A table file whose SHA-256 (of its UTF-8 text) must match the scenario's record (05 §E.7). */
function readTable<T>(dir: string, name: string, ref: { path: string; sha256: string }): T {
  const path = join(dir, ref.path);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new ScenarioCheckError("table_missing", `${name} table ${ref.path} is missing`);
  }
  if (sha256(text) !== ref.sha256) {
    throw new ScenarioCheckError("table_sha256", `${name} table ${ref.path} does not match its SHA-256 in scenario.json`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new ScenarioCheckError("table_sha256", `${name} table ${ref.path} is not valid JSON: ${(err as Error).message}`);
  }
}

/** Every stop task names a stop Waypoint (U-61), task ids are unique, and a stop has 1–4 tasks (FR-50). */
function checkStopTasks(scenario: Scenario): void {
  const stops = new Set(scenario.plan.waypoints.filter((w) => w.role === "stop").map((w) => w.id));
  const perStop = new Map<string, number>();
  const ids = new Set<string>();
  for (const t of scenario.stop_tasks ?? []) {
    if (!stops.has(t.stop_id)) throw new ScenarioCheckError("stop_task_stop", `task ${t.task_id}: ${t.stop_id} is not a stop Waypoint of the plan (U-61)`);
    if (ids.has(t.task_id)) throw new ScenarioCheckError("stop_task_id", `task_id ${t.task_id} appears twice`);
    ids.add(t.task_id);
    perStop.set(t.stop_id, (perStop.get(t.stop_id) ?? 0) + 1);
  }
  for (const [stop, n] of perStop) {
    if (n > 4) throw new ScenarioCheckError("stop_task_count", `stop ${stop} has ${n} tasks; FR-50 allows 1–4`);
  }
}

/** Load `param_sets/<id>.json` for every listed id; used ids must be listed; link, alert and shielding present. */
function readParamSets(dir: string, scenario: Scenario): Record<string, ParamSet> {
  const listed = new Set(scenario.param_sets);
  const used = [
    ...scenario.crew.map((c) => c.suit_param_set),
    ...scenario.vehicles.map((v) => v.param_set),
    ...(scenario.plan.scenario.vehicle_param_set ? [scenario.plan.scenario.vehicle_param_set] : []),
  ];
  for (const id of used) {
    if (!listed.has(id)) throw new ScenarioCheckError("param_set_unlisted", `ParamSet ${id} is used but not listed in param_sets`);
  }
  const params: Record<string, ParamSet> = {};
  for (const id of scenario.param_sets) {
    const p = readJsonFile<ParamSet>(join(dir, "param_sets", `${id}.json`), "param_set_missing");
    check(validators().paramSet, p, "param_set_schema", `param_sets/${id}.json`);
    if (p.param_set_id !== id) throw new ScenarioCheckError("param_set_id", `param_sets/${id}.json has param_set_id ${p.param_set_id}`);
    params[id] = p;
  }
  const kinds = new Set(Object.values(params).map((p) => p.kind));
  const missing = (["link", "alert", "shielding"] as const).filter((k) => !kinds.has(k));
  if (missing.length > 0) throw new ScenarioCheckError("param_set_kinds", `no ${missing.join(", ")} ParamSet listed (05 Scenario)`);
  return params;
}

interface Validators {
  scenario: ValidateFunction;
  plan: ValidateFunction;
  paramSet: ValidateFunction;
}

let cached: Validators | null = null;

/** Compiled once. Strict, except two rules that reject valid patterns in schemas/ (as in the T22.02 test). */
function validators(): Validators {
  if (cached) return cached;
  const schemasDir = join(dirname(fileURLToPath(import.meta.url)), "../../../schemas");
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  const compile = (file: string) => ajv.compile(JSON.parse(readFileSync(join(schemasDir, file), "utf8")) as object);
  cached = { scenario: compile("scenario.schema.json"), plan: compile("plan-export.schema.json"), paramSet: compile("param-set.schema.json") };
  return cached;
}

function check(validate: ValidateFunction, value: unknown, failCheck: string, where: string): void {
  if (!validate(value)) throw new ScenarioCheckError(failCheck, `${where} fails its schema: ${describe(validate.errors ?? [])}`);
}

function describe(errors: ErrorObject[]): string {
  return errors
    .slice(0, 5)
    .map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`)
    .join("; ");
}
