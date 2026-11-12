/**
 * Scenario loading and validation (docs/specs/05 §C.2 Scenario, 02 §E.7). Contract C14, frozen by
 * T22.01; implementation T22.11. Checks the schema, site_id and data_version, plan_hash, table
 * SHA-256s, and that every `stop_tasks[].stop_id` is a stop Waypoint with 1–4 tasks per stop
 * (FR-50, U-61). TASK-21 owns the format. Proposed follow-up (T22.11, 9 Nov): `loadSite` reads the
 * site's routing grid and comm_hab from `data/sites/<site_id>` and the loader checks that crew and
 * vehicle starts are passable (05 §E.7; FR-39, FR-40). Live-session shape (T32.07, T32.08; backend package 04,
 * 2026-11-12): `plan`, `events` and `stop_tasks` are optional (`stop_tasks` needs `plan`), and the loader checks
 * `mission_setup`, `event_library` and `task_library` against the Site (05 Scenario, §E.3; BD-78, BD-101).
 *
 * ajv comes through fastify (a declared hab-core dependency), as in the T22.02 fixture test.
 * TODO(decision): declare `ajv` and `ajv-formats` directly in the next dependency batch (T14.01).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { cellIndex, isCellPassable, loadGrid, vehiclePassable, type LoadedGrid } from "@marswalk/compute";
import type { DoseSeries, EarthLinkTable, EventLibraryEntry, HabCandidate, ParamSet, PlanExport, Scenario, Site, TaskLibraryEntry } from "@marswalk/protocol";
import { canonicalJson } from "./log";

/** The grid writer's cell limit, also 05 RoutingGrid `width*height ≤ 4e6` (`pipeline/src/marswalk_pipeline/grid.py` MAX_GRID_CELLS). */
const MAX_GRID_CELLS = 4_000_000;

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
  /** The validated `event_library` (05 EventLibraryEntry); never undefined. */
  eventLibrary: EventLibraryEntry[];
  /** The validated `task_library` (05 TaskLibraryEntry); `[]` when the scenario has none. */
  taskLibrary: TaskLibraryEntry[];
  /**
   * What the live session needs of the Site manifest: its `default_start` and `hab_candidates` (`[]` when it has none).
   * null when no site is loaded (fake scenario), as `grid`.
   */
  site: { default_start: { x_m: number; y_m: number }; hab_candidates: HabCandidate[] } | null;
  /**
   * The SiteRef this scenario was read with, kept so SELECT_HAB_SITE can read another candidate's comm grid
   * (`loadCandidateComm`, T32.14). Absent on a scenario assembled by hand (tests); such a session cannot swap sites.
   */
  site_ref?: SiteRef;
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
  // `plan` is the reference plan of a headless run; a live session has none until PUBLISH_PLAN (05 Scenario, T32.07).
  // `stop_tasks` without `plan` is already refused by the schema (`dependentRequired`).
  if (scenario.plan !== undefined) checkPlan(scenario.plan, "scenario.json plan");

  if (scenario.site_id !== site.site_id || (scenario.plan !== undefined && scenario.plan.site_id !== site.site_id)) {
    throw new ScenarioCheckError("site_id", `scenario site_id ${scenario.site_id} (plan ${scenario.plan?.site_id ?? "none"}) is not the loaded site ${site.site_id}`);
  }
  if (scenario.data_version !== site.data_version || (scenario.plan !== undefined && scenario.plan.data_version !== site.data_version)) {
    throw new ScenarioCheckError("data_version", `scenario data_version ${scenario.data_version} (plan ${scenario.plan?.data_version ?? "none"}) is not the loaded site's ${site.data_version}`);
  }

  const dose = readTable<DoseSeries>(dir, "dose_series", scenario.tables.dose_series);
  const earthLink = readTable<EarthLinkTable>(dir, "earth_link", scenario.tables.earth_link);

  if (scenario.plan !== undefined) checkStopTasks(scenario.plan, scenario.stop_tasks ?? []);
  const params = readParamSets(dir, scenario);
  checkMissionSetup(scenario, params);
  checkEventLibrary(scenario, dose);
  checkTaskLibrary(scenario.task_library ?? []);

  const events = scenario.events ?? [];
  const times = events.map((e) => Date.parse(e.t_utc));
  if (times.some((t, i) => i > 0 && t < times[i - 1])) {
    throw new ScenarioCheckError("events_order", "scenario events must be sorted by t_utc (05 Scenario)");
  }

  // The grid is the costly step (about 12 MB for the real 1200 x 1200 site), so it comes after the cheap checks.
  const loaded = site.dir === null ? null : loadSite(site.dir, site.site_id, site.data_version);
  if (loaded !== null) {
    checkHabCandidate(scenario, loaded.manifest);
    checkTaskLibraryPois(scenario.task_library ?? [], loaded.manifest, site.dir!);
    checkStarts(scenario, params, loaded.grid);
  }
  // The comm grid and mast are those of the candidate the scenario starts with (rank 1 unless `mission_setup` says otherwise).
  const chosen = loaded?.manifest.hab_candidates?.find((c) => c.candidate_id === scenario.mission_setup.hab_candidate_id);
  const comm = loaded === null ? null : chosen === undefined || chosen.rank === 1 ? loaded.comm : loadCandidateComm(site, chosen.candidate_id);
  return {
    scenario: { ...scenario, events },
    dose,
    earthLink,
    params,
    grid: loaded?.grid ?? null,
    comm,
    eventLibrary: scenario.event_library,
    taskLibrary: scenario.task_library ?? [],
    site_ref: site,
    site: loaded === null ? null : { default_start: { x_m: loaded.manifest.default_start.x_m, y_m: loaded.manifest.default_start.y_m }, hab_candidates: loaded.manifest.hab_candidates ?? [] },
  };
}

/**
 * Load `<siteDir>` routing grid and hab comm coverage (05 RoutingGrid, §E.3; 02 §E.1). Reads
 * `site-manifest.json` (schema, `site_id`, `data_version`), then every grid asset the manifest names:
 * SHA-256 and dimensions are checked here, array lengths by compute `loadGrid`. All file reads happen
 * here so `@marswalk/compute` stays browser-safe. Throws ScenarioCheckError `grid_endian`,
 * `site_manifest`, `site_id`, `data_version`, `grid_asset` (unlisted, or a path outside the site
 * folder), `grid_missing`, `grid_sha256` or `grid_dims`.
 *
 * Per asset: `format` is the array's type (f32 elevation and TI, u8 the rest) and `bytes` is the
 * file length. The five 5 m arrays also have the grid's width and height. The TI sidecar is its own
 * coarse grid (`ti_cell_m`, 05 RoutingGrid), so it must carry its own `width` and `height`, as the pipeline grid
 * writer takes them from the TI array's shape (`pipeline/src/marswalk_pipeline/grid.py`, `write_grid`: rows x
 * columns, at most MAX_GRID_CELLS = 4,000,000 cells), and its file length must be width x height x 4 (f32);
 * the same formula, written into 05 RoutingGrid "TI sidecar dimensions" (BD-78).
 *
 * `loadGrid` wraps the files in host-order typed arrays and the manifest says little-endian, so a
 * big-endian host is refused (x86 and Apple ARM are little-endian).
 */
export function loadSite(
  siteDir: string,
  site_id: string,
  data_version: string,
): { grid: LoadedGrid; comm: NonNullable<LoadedScenario["comm"]>; manifest: Site } {
  const { manifest, manifestPath, read } = openSite(siteDir, site_id, data_version);
  const meta = manifest.grid;
  const elevation = read(meta.elevation_asset, "f32", true);
  const slopeP90 = read(meta.slope_p90_asset, "u8", true);
  const slopeMax = read(meta.slope_max_asset, "u8", true);
  const flags = read(meta.flags_asset, "u8", true);
  const commHab = read(meta.comm_hab_asset, "u8", true);
  const ti = meta.ti_asset === undefined ? undefined : read(meta.ti_asset, "f32", false);
  let grid: LoadedGrid;
  try {
    grid = loadGrid(meta, { elevation, slopeP90, slopeMax, flags, commHab, ...(ti === undefined ? {} : { ti }) });
  } catch (err) {
    throw new ScenarioCheckError("grid_dims", `${manifestPath} grid arrays do not match ${meta.width}x${meta.height}: ${(err as Error).message}`);
  }
  return { grid, comm: { comm_hab: grid.commHab, hab_mast: meta.hab_mast }, manifest };
}

/**
 * One candidate's static hab comm coverage and mast, for SELECT_HAB_SITE (05 HabCandidate; T32.08). The grid is
 * `grid-comm-hab` for the rank-1 candidate and `grid-comm-<candidate_id>` for the others (T03.37), and must be the
 * asset the candidate's own `comm_hab_asset` names. It goes through the same manifest, SHA-256 and dimension checks
 * as `loadSite`. Throws ScenarioCheckError `site` (no site folder), `hab_candidate` (unknown candidate, or the
 * candidate's `comm_hab_asset` is not the expected id), or any `loadSite` check.
 */
export function loadCandidateComm(site: SiteRef, candidate_id: string): NonNullable<LoadedScenario["comm"]> {
  if (site.dir === null) throw new ScenarioCheckError("site", "no site folder is loaded, so no hab candidate's comm grid can be read");
  const { manifest, read } = openSite(site.dir, site.site_id, site.data_version);
  const candidate = manifest.hab_candidates?.find((c) => c.candidate_id === candidate_id);
  if (!candidate) throw new ScenarioCheckError("hab_candidate", `hab candidate ${candidate_id} is not in the Site's hab_candidates`);
  const assetId = candidate.rank === 1 ? "grid-comm-hab" : `grid-comm-${candidate.candidate_id}`;
  if (candidate.comm_hab_asset !== assetId) {
    throw new ScenarioCheckError("hab_candidate", `hab candidate ${candidate_id} names comm_hab_asset ${candidate.comm_hab_asset}, expected ${assetId} (T03.37)`);
  }
  return { comm_hab: new Uint8Array(read(assetId, "u8", true)), hab_mast: candidate.hab_mast };
}

/** The manifest of a site folder (schema, `site_id`, `data_version`) and a checked reader for the assets it lists. */
function openSite(
  siteDir: string,
  site_id: string,
  data_version: string,
): { manifest: Site; manifestPath: string; read: (assetId: string, format: "f32" | "u8", onGrid: boolean) => ArrayBuffer } {
  if (os.endianness() !== "LE") {
    throw new ScenarioCheckError("grid_endian", "site grids are little-endian and this host is big-endian (05 RoutingGrid)");
  }
  const manifestPath = join(siteDir, "site-manifest.json");
  const manifest = readJsonFile<Site>(manifestPath, "site_manifest");
  check(validators().site, manifest, "site_manifest", manifestPath);
  if (manifest.site_id !== site_id) {
    throw new ScenarioCheckError("site_id", `${manifestPath} describes site ${manifest.site_id}, not ${site_id}`);
  }
  if (manifest.data_version !== data_version) {
    throw new ScenarioCheckError("data_version", `${manifestPath} has data_version ${manifest.data_version}, not ${data_version}`);
  }

  const meta = manifest.grid;
  const root = resolve(siteDir);
  const read = (assetId: string, format: "f32" | "u8", onGrid: boolean): ArrayBuffer => {
    const bytes = readAsset(manifest, root, assetId);
    const asset = manifest.assets.find((a) => a.asset_id === assetId)!;
    if (asset.format !== format) {
      throw new ScenarioCheckError("grid_dims", `grid asset ${assetId} has format ${asset.format}, expected ${format}`);
    }
    if (asset.bytes !== undefined && asset.bytes !== bytes.length) {
      throw new ScenarioCheckError("grid_dims", `grid asset ${assetId} records ${asset.bytes} bytes, its file has ${bytes.length}`);
    }
    if (onGrid) {
      if (asset.width !== undefined && asset.height !== undefined && (asset.width !== meta.width || asset.height !== meta.height)) {
        throw new ScenarioCheckError("grid_dims", `grid asset ${assetId} is ${asset.width}x${asset.height}, the grid is ${meta.width}x${meta.height}`);
      }
    } else {
      // The TI sidecar has its own shape (BD-78): width and height are integers, at most MAX_GRID_CELLS cells, and fill the f32 file.
      const { width, height } = asset;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width! < 1 || height! < 1) {
        throw new ScenarioCheckError("grid_dims", `TI asset ${assetId} needs an integer width and height of at least 1 (05 RoutingGrid, BD-78)`);
      }
      if (width! * height! > MAX_GRID_CELLS) {
        throw new ScenarioCheckError("grid_dims", `TI asset ${assetId} is ${width}x${height} (${width! * height!} cells), over the ${MAX_GRID_CELLS}-cell limit of the grid writer`);
      }
      if (width! * height! * Float32Array.BYTES_PER_ELEMENT !== bytes.length) {
        throw new ScenarioCheckError("grid_dims", `grid asset ${assetId} is ${width}x${height} but its file has ${bytes.length} bytes`);
      }
    }
    // An exact copy: a Node Buffer can be a view into a larger pooled ArrayBuffer, so `bytes.buffer` is not the file.
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  };
  return { manifest, manifestPath, read };
}

/** `grid_asset` (unlisted, or a path outside the site folder), `grid_missing` or `grid_sha256`; else the file's bytes. */
function readAsset(manifest: Site, root: string, assetId: string): Buffer {
  const asset = manifest.assets.find((a) => a.asset_id === assetId);
  if (!asset) throw new ScenarioCheckError("grid_asset", `grid asset ${assetId} is not listed in the manifest's assets (05 §E.3)`);
  const file = resolve(root, asset.path);
  if (!file.startsWith(root + sep)) {
    throw new ScenarioCheckError("grid_asset", `grid asset ${assetId}: path ${asset.path} is outside the site folder`);
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    throw new ScenarioCheckError("grid_missing", `grid asset ${assetId}: ${file} is missing; run the pipeline or fetch the site bundle`);
  }
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
    throw new ScenarioCheckError("grid_sha256", `grid asset ${assetId} (${asset.path}) does not match its SHA-256 in the manifest`);
  }
  return bytes;
}

/**
 * Crew start at the plan's start waypoint (the hab) and each vehicle at its own `start_*_m`; every
 * start must be on a passable cell (05 §E.7). A scenario with no plan has no crew start to check here (the crew start
 * at the chosen candidate's `default_start`, a passable cell by the Site's own rule, and no slope limit exists before
 * PUBLISH_PLAN); its vehicles are checked. Crew use the plan's `hard_slope_limit_deg`; a vehicle
 * uses its ParamSet's `hard_slope_deg` (compute `vehiclePassable`). Throws `start_missing` (no start
 * waypoint), `start_blocked`, `param_set_unlisted` or `vehicle_params` (not a rover ParamSet).
 */
export function checkStarts(scenario: Scenario, params: Record<string, ParamSet>, grid: LoadedGrid): void {
  // cellIndex returns null outside the grid, and NaN (not null) for non-finite coordinates.
  const cellAt = (x_m: number, y_m: number): number | null => {
    const k = cellIndex(grid, x_m, y_m);
    return k === null || !Number.isFinite(k) ? null : k;
  };
  const plan = scenario.plan;
  if (plan !== undefined) {
    const start = plan.waypoints.find((w) => w.role === "start");
    if (!start) throw new ScenarioCheckError("start_missing", "the plan has no start waypoint, so the crew start cannot be checked (05 §E.7)");
    const startCell = cellAt(start.x_m, start.y_m);
    if (startCell === null || !isCellPassable(grid, startCell, plan.scenario.hard_slope_limit_deg)) {
      throw new ScenarioCheckError("start_blocked", `crew start ${start.id} (${start.x_m}, ${start.y_m}) is not on a passable cell of the site grid (05 §E.7)`);
    }
  }
  for (const v of scenario.vehicles) {
    const p = params[v.param_set];
    if (!p) throw new ScenarioCheckError("param_set_unlisted", `vehicle ${v.vehicle_id} uses ParamSet ${v.param_set}, which is not loaded`);
    let passable: Uint8Array;
    try {
      passable = vehiclePassable(grid, p);
    } catch (err) {
      throw new ScenarioCheckError("vehicle_params", `vehicle ${v.vehicle_id}: ParamSet ${v.param_set} cannot give a passability mask: ${(err as Error).message}`);
    }
    const k = cellAt(v.start_x_m, v.start_y_m);
    if (k === null || passable[k] !== 1) {
      throw new ScenarioCheckError("start_blocked", `vehicle ${v.vehicle_id} start (${v.start_x_m}, ${v.start_y_m}) is not on a passable cell for a ${v.kind} (05 §E.7)`);
    }
  }
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
function checkStopTasks(plan: PlanExport, stopTasks: NonNullable<Scenario["stop_tasks"]>): void {
  const stops = new Set(plan.waypoints.filter((w) => w.role === "stop").map((w) => w.id));
  const perStop = new Map<string, number>();
  const ids = new Set<string>();
  for (const t of stopTasks) {
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
    ...(scenario.plan?.scenario.vehicle_param_set ? [scenario.plan.scenario.vehicle_param_set] : []),
    ...(scenario.mission_setup.vehicle_param_set ? [scenario.mission_setup.vehicle_param_set] : []),
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

/**
 * `mission_setup` (05 Scenario; ranges are in the schema, 02 §E.3): `crew_count` equals the length of `crew[]`,
 * `vehicle_available: true` needs a `vehicle_param_set`, and a given `vehicle_param_set` is a listed
 * pressurized-rover ParamSet (05 MissionSetup). Throws `mission_setup_crew_count` or `mission_setup_vehicle`
 * (`param_set_unlisted` comes from `readParamSets`). The candidate is checked against the Site by `checkHabCandidate`.
 */
function checkMissionSetup(scenario: Scenario, params: Record<string, ParamSet>): void {
  const m = scenario.mission_setup;
  if (m.crew_count !== undefined && m.crew_count !== scenario.crew.length) {
    throw new ScenarioCheckError("mission_setup_crew_count", `mission_setup crew_count ${m.crew_count} differs from the ${scenario.crew.length} entries of crew[] (05 Scenario)`);
  }
  if (m.vehicle_available === true && !m.vehicle_param_set) {
    throw new ScenarioCheckError("mission_setup_vehicle", "mission_setup vehicle_available is true but vehicle_param_set is missing (05 Scenario)");
  }
  if (m.vehicle_param_set && params[m.vehicle_param_set]?.kind !== "pressurized_rover") {
    throw new ScenarioCheckError("mission_setup_vehicle", `mission_setup vehicle_param_set ${m.vehicle_param_set} is not a pressurized_rover ParamSet (05 MissionSetup)`);
  }
}

/**
 * `mission_setup.hab_candidate_id` against the Site manifest (05 Scenario): a `candidate_id` of the Site's
 * `hab_candidates`, and omitted exactly when the Site has none. Throws `hab_candidate`.
 */
function checkHabCandidate(scenario: Scenario, manifest: Site): void {
  const id = scenario.mission_setup.hab_candidate_id;
  const candidates = manifest.hab_candidates ?? [];
  if (candidates.length === 0) {
    if (id !== undefined) throw new ScenarioCheckError("hab_candidate", `mission_setup hab_candidate_id ${id} is set but the Site has no hab_candidates; omit it (05 Scenario)`);
    return;
  }
  if (id === undefined) throw new ScenarioCheckError("hab_candidate", `mission_setup hab_candidate_id is missing but the Site lists ${candidates.length} hab_candidates (05 Scenario)`);
  if (!candidates.some((c) => c.candidate_id === id)) {
    throw new ScenarioCheckError("hab_candidate", `mission_setup hab_candidate_id ${id} is not a candidate_id of the Site's hab_candidates (${candidates.map((c) => c.candidate_id).join(", ")})`);
  }
}

/**
 * `event_library` (05 EventLibraryEntry): unique `event_id`; `dose_series` is the key of the DoseSeries table in
 * `tables`; `series_start_utc` is a sample time of that series. Input offsets >= 0 are in the schema. Throws
 * `event_library_id`, `event_library_dose_series` or `event_library_series_start`.
 */
function checkEventLibrary(scenario: Scenario, dose: DoseSeries): void {
  const ids = new Set<string>();
  for (const e of scenario.event_library) {
    if (ids.has(e.event_id)) throw new ScenarioCheckError("event_library_id", `event_library event_id ${e.event_id} appears twice`);
    ids.add(e.event_id);
    if (e.dose_series !== "dose_series" || !(e.dose_series in scenario.tables)) {
      throw new ScenarioCheckError("event_library_dose_series", `event ${e.event_id}: dose_series ${String(e.dose_series)} is not the dose_series table in tables (${Object.keys(scenario.tables).join(", ")})`);
    }
    const start = Date.parse(e.series_start_utc);
    if (!dose.samples.some(([t]) => Date.parse(t) === start)) {
      throw new ScenarioCheckError("event_library_series_start", `event ${e.event_id}: series_start_utc ${e.series_start_utc} is not a sample time of the ${dose.series_id} series (05 EventLibraryEntry)`);
    }
  }
}

/**
 * `task_library` without the Site (05 TaskLibraryEntry): unique `library_task_id`, 1-4 entries per POI (FR-50; a POI
 * with no entry is simply absent), and a `source_id` whenever `text` contains any ASCII digit (BD-101). Text length
 * is in the schema. Throws `task_library_id`, `task_library_count` or `task_library_source`.
 */
function checkTaskLibrary(library: TaskLibraryEntry[]): void {
  const ids = new Set<string>();
  const perPoi = new Map<string, number>();
  for (const t of library) {
    if (ids.has(t.library_task_id)) throw new ScenarioCheckError("task_library_id", `library_task_id ${t.library_task_id} appears twice`);
    ids.add(t.library_task_id);
    perPoi.set(t.poi_id, (perPoi.get(t.poi_id) ?? 0) + 1);
    if (/[0-9]/.test(t.text) && !t.source_id) {
      throw new ScenarioCheckError("task_library_source", `task ${t.library_task_id}: the text contains a digit, so it needs a source_id (05 TaskLibraryEntry, BD-101)`);
    }
  }
  for (const [poi, n] of perPoi) {
    if (n > 4) throw new ScenarioCheckError("task_library_count", `POI ${poi} has ${n} task_library entries; FR-50 allows 1-4`);
  }
}

/** Every `task_library[].poi_id` is a POI of the Site (`pois_asset`, GeoJSON features with `properties.poi_id`). Throws `task_library_poi` or `site_pois`. */
function checkTaskLibraryPois(library: TaskLibraryEntry[], manifest: Site, siteDir: string): void {
  if (library.length === 0) return;
  let pois: Set<string>;
  try {
    const collection = JSON.parse(readAsset(manifest, resolve(siteDir), manifest.pois_asset).toString("utf8")) as { features?: { properties?: { poi_id?: unknown } }[] };
    pois = new Set((collection.features ?? []).map((f) => f.properties?.poi_id).filter((id): id is string => typeof id === "string"));
  } catch (err) {
    throw new ScenarioCheckError("site_pois", `cannot read the Site's POIs (${manifest.pois_asset}) to resolve task_library: ${(err as Error).message}`);
  }
  for (const t of library) {
    if (!pois.has(t.poi_id)) throw new ScenarioCheckError("task_library_poi", `task ${t.library_task_id}: poi_id ${t.poi_id} is not a POI of the Site (${manifest.site_id})`);
  }
}

interface Validators {
  scenario: ValidateFunction;
  plan: ValidateFunction;
  paramSet: ValidateFunction;
  site: ValidateFunction;
}

let cached: Validators | null = null;

/** Compiled once. Strict, except two rules that reject valid patterns in schemas/ (as in the T22.02 test). */
function validators(): Validators {
  if (cached) return cached;
  const schemasDir = join(dirname(fileURLToPath(import.meta.url)), "../../../schemas");
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  const compile = (file: string) => ajv.compile(JSON.parse(readFileSync(join(schemasDir, file), "utf8")) as object);
  cached = { scenario: compile("scenario.schema.json"), plan: compile("plan-export.schema.json"), paramSet: compile("param-set.schema.json"), site: compile("site-manifest.schema.json") };
  return cached;
}

/**
 * A PlanExport against schemas/plan-export.schema.json and its own `plan_hash` (first 12 hex of
 * SHA-256 over the RFC 8785 JSON of {data_version, scenario, waypoints}; 05 PlanExport). Used at
 * load and for PUBLISH_PLAN. Throws ScenarioCheckError `plan_schema` or `plan_hash`.
 */
export function checkPlan(plan: unknown, where = "plan"): asserts plan is PlanExport {
  check(validators().plan, plan, "plan_schema", where);
  const { data_version, scenario: mission, waypoints, plan_hash } = plan as PlanExport;
  const computed = sha256(canonicalJson({ data_version, scenario: mission, waypoints })).slice(0, 12);
  if (computed !== plan_hash) throw new ScenarioCheckError("plan_hash", `plan_hash ${plan_hash} does not verify (computed ${computed}, 05 PlanExport)`);
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
