/**
 * T22.11: scenario loader checks (docs/specs/05 Scenario, §E.7; 02 §E.7; FR-34, FR-50, NFR-10).
 * Each rejection reason has one named test. Every case copies the fake scenario (F8, T22.02) to a
 * temporary folder and breaks one thing; the fixture itself is never edited.
 */
import { createHash } from "node:crypto";
import os from "node:os";
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cellIndex, isCellPassable, vehiclePassable } from "@marswalk/compute";
import type { LogEventData, Scenario, Site } from "@marswalk/protocol";
import { initialState, reduce, type EngineState } from "../src/engine/reducer";
import { canonicalJson } from "../src/log";
import { tick } from "../src/engine/tick";
import { checkStarts, loadSite, readScenario, ScenarioCheckError, type LoadedScenario, type SiteRef } from "../src/scenario";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/fake-scenario");
const REPO_ROOT = join(here, "../../..");
const MOCK_SITE_DIR = join(REPO_ROOT, "data/sites/mock_site");
const SITE: SiteRef = { site_id: "mock_site", data_version: "mock_site-fixture", dir: null };

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** A copy of the fake scenario folder, with `edit` applied to its scenario.json. */
function copyWith(edit: (s: Scenario) => void = () => {}): string {
  const dir = mkdtempSync(join(tmpdir(), "marswalk-scenario-"));
  dirs.push(dir);
  cpSync(fixtureDir, dir, { recursive: true });
  const path = join(dir, "scenario.json");
  const scenario = JSON.parse(readFileSync(path, "utf8")) as Scenario;
  edit(scenario);
  writeFileSync(path, `${JSON.stringify(scenario, null, 2)}\n`);
  return dir;
}

function rejection(dir: string, site: SiteRef = SITE): ScenarioCheckError {
  try {
    readScenario(dir, site);
  } catch (err) {
    expect(err).toBeInstanceOf(ScenarioCheckError);
    return err as ScenarioCheckError;
  }
  throw new Error("expected readScenario to reject");
}

describe("readScenario (T22.11, 05 §E.7)", () => {
  it("loads the fake scenario with its tables and every listed ParamSet", () => {
    const loaded = readScenario(fixtureDir, SITE);
    expect(loaded.scenario.scenario_id).toBe("fake-straight-line");
    expect(loaded.dose.samples.length).toBeGreaterThan(0);
    expect(loaded.earthLink.rows).toHaveLength(1);
    expect(Object.keys(loaded.params).sort()).toEqual(["alert-assumed", "link-assumed", "pr1-assumed", "shielding-assumed", "suit-assumed"]);
    expect(loaded.params["pr1-assumed"].param_set_id).toBe("pr1-assumed");
    expect(loaded.grid).toBeNull();
    expect(loaded.comm).toBeNull();
  });

  it("rejects a missing or unreadable scenario.json", () => {
    const dir = copyWith();
    unlinkSync(join(dir, "scenario.json"));
    expect(rejection(dir).check).toBe("read");
  });

  it("rejects a scenario.json that fails schemas/scenario.schema.json", () => {
    const dir = copyWith((s) => {
      (s as unknown as Record<string, unknown>).seed = "4190";
    });
    const err = rejection(dir);
    expect(err.check).toBe("schema");
    expect(err.message).toMatch(/seed/);
  });

  it("rejects a plan that fails schemas/plan-export.schema.json", () => {
    const dir = copyWith((s) => {
      delete (s.plan as unknown as Record<string, unknown>).disclaimer;
    });
    expect(rejection(dir).check).toBe("plan_schema");
  });

  it("rejects a site_id that is not the loaded site's", () => {
    expect(rejection(fixtureDir, { ...SITE, site_id: "gale_boxwork" }).check).toBe("site_id");
  });

  it("rejects a data_version that is not the loaded site's", () => {
    expect(rejection(fixtureDir, { ...SITE, data_version: "mock_site-2026.11.08" }).check).toBe("data_version");
  });

  it("rejects a plan whose plan_hash does not verify (RFC 8785 canonical JSON)", () => {
    const dir = copyWith((s) => {
      s.plan!.scenario.dwell_min_per_stop = 25;
    });
    expect(rejection(dir).check).toBe("plan_hash");
  });

  it("rejects a table whose SHA-256 does not match", () => {
    const dir = copyWith();
    const path = join(dir, "dose_series.json");
    writeFileSync(path, readFileSync(path, "utf8").replace("\n", "\n "));
    const err = rejection(dir);
    expect(err.check).toBe("table_sha256");
    expect(err.message).toMatch(/dose_series/);
  });

  it("rejects a table file that is missing", () => {
    const dir = copyWith();
    unlinkSync(join(dir, "earth_link.json"));
    expect(rejection(dir).check).toBe("table_missing");
  });

  it("rejects a stop task whose stop_id is not a stop Waypoint (U-61)", () => {
    const dir = copyWith((s) => {
      s.stop_tasks![0].stop_id = "wp-0"; // the start, not a stop
    });
    expect(rejection(dir).check).toBe("stop_task_stop");
  });

  it("rejects more than 4 tasks on one stop (FR-50)", () => {
    const dir = copyWith((s) => {
      s.stop_tasks = Array.from({ length: 5 }, (_, i) => ({ task_id: `t-s1-0${i + 1}`, stop_id: "wp-1", crew_id: null, kind: "other", text: "Fixture task" }));
    });
    expect(rejection(dir).check).toBe("stop_task_count");
  });

  it("rejects a duplicate task_id", () => {
    const dir = copyWith((s) => {
      s.stop_tasks![1].task_id = s.stop_tasks![0].task_id;
    });
    expect(rejection(dir).check).toBe("stop_task_id");
  });

  it("rejects a ParamSet that is used but not listed in param_sets", () => {
    const dir = copyWith((s) => {
      s.crew[1].suit_param_set = "suit-other";
    });
    expect(rejection(dir).check).toBe("param_set_unlisted");
  });

  it("rejects a listed ParamSet whose file is missing", () => {
    const dir = copyWith();
    unlinkSync(join(dir, "param_sets", "link-assumed.json"));
    expect(rejection(dir).check).toBe("param_set_missing");
  });

  it("rejects a ParamSet file whose param_set_id differs from its name", () => {
    const dir = copyWith();
    const path = join(dir, "param_sets", "suit-assumed.json");
    writeFileSync(path, readFileSync(path, "utf8").replace('"param_set_id": "suit-assumed"', '"param_set_id": "suit-renamed"'));
    expect(rejection(dir).check).toBe("param_set_id");
  });

  it("rejects a scenario without one link, alert and shielding ParamSet (05 Scenario)", () => {
    const dir = copyWith((s) => {
      s.param_sets = s.param_sets.filter((id) => id !== "shielding-assumed");
    });
    expect(rejection(dir).check).toBe("param_set_kinds");
  });

  it("rejects scenario events that are not sorted by t_utc", () => {
    const dir = copyWith((s) => {
      s.events = [{ ...s.events![0], event_id: "e2", t_utc: "2024-05-20T02:00:00Z" }, s.events![0]];
    });
    expect(rejection(dir).check).toBe("events_order");
  });
});

// ---- T22.11 follow-up (Proposed): the Hab Core loads the site routing grid and comm_hab -------------------
// 05 §E.7 (grid load, passable starts), 02 §E.1; FR-39, FR-40, NFR-01. The oracle is the tracked mock site
// (F4): every expected number comes from its manifest or from compute, none is typed in here.

const manifestOf = (dir: string): Site => JSON.parse(readFileSync(join(dir, "site-manifest.json"), "utf8")) as Site;
const MOCK = manifestOf(MOCK_SITE_DIR);
const MOCK_REF: SiteRef = { site_id: MOCK.site_id, data_version: MOCK.data_version, dir: MOCK_SITE_DIR };
const sha256Bytes = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
const assetOf = (m: Site, id: string) => m.assets.find((a) => a.asset_id === id)!;
const loadMock = () => loadSite(MOCK_SITE_DIR, MOCK.site_id, MOCK.data_version);

/** A temporary copy of the mock site; `edit` changes its manifest (and may rewrite files). */
function siteCopy(edit: (m: Site, dir: string) => void = () => {}): string {
  const dir = mkdtempSync(join(tmpdir(), "marswalk-site-"));
  dirs.push(dir);
  cpSync(MOCK_SITE_DIR, dir, { recursive: true });
  const m = manifestOf(dir);
  edit(m, dir);
  writeFileSync(join(dir, "site-manifest.json"), `${JSON.stringify(m, null, 2)}\n`);
  return dir;
}
/** Edit one grid file and record its new SHA-256, so that only the grid content changes. */
function rewriteAsset(m: Site, dir: string, assetId: string, edit: (b: Buffer) => void): void {
  const a = assetOf(m, assetId);
  const path = join(dir, a.path);
  const bytes = readFileSync(path);
  edit(bytes);
  writeFileSync(path, bytes);
  a.sha256 = sha256Bytes(bytes);
}
function siteRejection(dir: string, ref: SiteRef = MOCK_REF): ScenarioCheckError {
  try {
    loadSite(dir, ref.site_id, ref.data_version);
  } catch (err) {
    expect(err).toBeInstanceOf(ScenarioCheckError);
    return err as ScenarioCheckError;
  }
  throw new Error("expected loadSite to reject");
}
/** Centre of array offset k in projected metres; row 0 is north (05 §E.1). */
function centreOf(m: Site, k: number): { x_m: number; y_m: number } {
  const i = Math.floor(k / m.grid.width);
  const j = k % m.grid.width;
  return { x_m: m.grid.origin_m[0] + (j + 0.5) * m.grid.cell_m, y_m: m.grid.origin_m[1] - (i + 0.5) * m.grid.cell_m };
}
/**
 * A copy of the fake scenario folder made for the mock site: its `data_version` (and the plan's) is the
 * manifest's, because the site schema does not allow the fixture's `mock_site-fixture`; `plan_hash` is recomputed.
 */
function scenarioForMock(edit: (s: Scenario) => void = () => {}): string {
  return copyWith((s) => {
    s.data_version = MOCK.data_version;
    s.plan!.data_version = MOCK.data_version;
    delete s.mission_setup.hab_candidate_id; // the mock site has no hab_candidates, so none may be named (T32.08)
    edit(s);
    const { data_version, scenario, waypoints } = s.plan!;
    s.plan!.plan_hash = createHash("sha256").update(canonicalJson({ data_version, scenario, waypoints }), "utf8").digest("hex").slice(0, 12);
  });
}
const fakeScenarioJson = () => JSON.parse(readFileSync(join(fixtureDir, "scenario.json"), "utf8")) as Scenario;

describe("loadSite (T22.11 follow-up, 05 §E.7; FR-39, FR-40)", () => {
  it("loads the mock site: every array has width x height cells, read from its manifest", () => {
    const { grid } = loadMock();
    const cells = MOCK.grid.width * MOCK.grid.height;
    expect(grid.meta).toEqual(MOCK.grid);
    for (const a of [grid.elevation, grid.slopeP90, grid.slopeMax, grid.flags, grid.commHab]) expect(a.length).toBe(cells);
    const ti = readFileSync(join(MOCK_SITE_DIR, assetOf(MOCK, MOCK.grid.ti_asset!).path));
    expect(grid.ti).toBeInstanceOf(Float32Array);
    expect(grid.ti!.length).toBe(ti.length / Float32Array.BYTES_PER_ELEMENT);
  });

  it("the arrays hold the bytes of the manifest's assets and own their buffers (no pooled-Buffer view)", () => {
    const { grid } = loadMock();
    const file = (id: string) => readFileSync(join(MOCK_SITE_DIR, assetOf(MOCK, id).path));
    expect(Array.from(grid.flags)).toEqual(Array.from(file(MOCK.grid.flags_asset)));
    expect(Array.from(grid.slopeP90)).toEqual(Array.from(file(MOCK.grid.slope_p90_asset)));
    const raw = file(MOCK.grid.elevation_asset);
    const want = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    expect(Array.from(grid.elevation, String)).toEqual(Array.from(want, String)); // String so the NaN cells compare equal
    for (const a of [grid.elevation, grid.slopeP90, grid.slopeMax, grid.flags, grid.commHab]) {
      expect(a.byteOffset).toBe(0);
      expect(a.buffer.byteLength).toBe(a.byteLength);
    }
  });

  it("comm carries the comm_hab array and the manifest's hab_mast", () => {
    const { grid, comm } = loadMock();
    expect(comm.hab_mast).toEqual(MOCK.grid.hab_mast);
    expect(comm.comm_hab).toBe(grid.commHab);
    const file = readFileSync(join(MOCK_SITE_DIR, assetOf(MOCK, MOCK.grid.comm_hab_asset).path));
    expect(Array.from(comm.comm_hab)).toEqual(Array.from(file));
  });

  it("fails loudly when the site bundle or its manifest is missing", () => {
    const dir = siteCopy();
    unlinkSync(join(dir, "site-manifest.json"));
    expect(siteRejection(dir).check).toBe("site_manifest");
    const absent = join(dir, "no-such-site");
    expect(siteRejection(absent, { ...MOCK_REF, dir: absent }).check).toBe("site_manifest");
  });

  it("rejects a manifest that fails schemas/site-manifest.schema.json", () => {
    const dir = siteCopy((m) => {
      delete (m as unknown as Record<string, unknown>).grid;
    });
    const err = siteRejection(dir);
    expect(err.check).toBe("site_manifest");
    expect(err.message).toMatch(/grid/);
  });

  it("rejects a manifest for another site or data_version", () => {
    expect(siteRejection(MOCK_SITE_DIR, { ...MOCK_REF, data_version: "mock_site-2026.11.08" }).check).toBe("data_version");
    expect(siteRejection(MOCK_SITE_DIR, { ...MOCK_REF, site_id: "gale_boxwork" }).check).toBe("site_id");
  });

  it("rejects a grid asset id the manifest does not list", () => {
    const dir = siteCopy((m) => {
      m.assets = m.assets.filter((a) => a.asset_id !== m.grid.flags_asset);
    });
    const err = siteRejection(dir);
    expect(err.check).toBe("grid_asset");
    expect(err.message).toContain(MOCK.grid.flags_asset);
  });

  it("fails loudly on a missing grid file, naming it (never a silent null)", () => {
    const dir = siteCopy();
    const path = assetOf(MOCK, MOCK.grid.slope_p90_asset).path;
    unlinkSync(join(dir, path));
    const err = siteRejection(dir);
    expect(err.check).toBe("grid_missing");
    expect(err.message).toContain(path);
  });

  it("rejects a grid file whose SHA-256 differs from the manifest's", () => {
    const dir = siteCopy();
    const path = join(dir, assetOf(MOCK, MOCK.grid.elevation_asset).path);
    const bytes = readFileSync(path);
    bytes[0] = bytes[0]! ^ 0xff;
    writeFileSync(path, bytes);
    const err = siteRejection(dir);
    expect(err.check).toBe("grid_sha256");
    expect(err.message).toContain(MOCK.grid.elevation_asset);
  });

  it("rejects an asset whose width or height is not the grid's", () => {
    const dir = siteCopy((m) => {
      assetOf(m, m.grid.flags_asset).height! += 1;
    });
    const err = siteRejection(dir);
    expect(err.check).toBe("grid_dims");
    expect(err.message).toContain(MOCK.grid.flags_asset);
  });

  it("rejects files that do not hold width x height cells (compute's check, re-raised)", () => {
    const dir = siteCopy((m) => {
      m.grid.height += 1;
      for (const id of [m.grid.elevation_asset, m.grid.slope_p90_asset, m.grid.slope_max_asset, m.grid.flags_asset, m.grid.comm_hab_asset, m.grid.ti_asset!]) assetOf(m, id).height! += 1;
    });
    expect(siteRejection(dir).check).toBe("grid_dims");
  });
});

describe("readScenario with a site directory (T22.11 follow-up, 05 §E.7)", () => {
  const ref = (dir: string): SiteRef => ({ ...MOCK_REF, dir });

  it("loads the grid and comm_hab on scenario load; a null dir keeps both null", () => {
    const loaded = readScenario(scenarioForMock(), ref(siteCopy()));
    expect(loaded.grid!.meta.width).toBe(MOCK.grid.width);
    expect(loaded.comm!.hab_mast).toEqual(MOCK.grid.hab_mast);
    expect(loaded.comm!.comm_hab).toBe(loaded.grid!.commHab);
    const none = readScenario(fixtureDir, SITE);
    expect(none.grid).toBeNull();
    expect(none.comm).toBeNull();
  });

  it("checks data_version before it reads the grid", () => {
    const dir = siteCopy();
    unlinkSync(join(dir, assetOf(MOCK, MOCK.grid.flags_asset).path));
    expect(rejection(scenarioForMock(), { ...ref(dir), data_version: "mock_site-2026.11.08" }).check).toBe("data_version");
  });

  it("rejects the plan's start waypoint (where the crew leave the hab) on a hazard cell", () => {
    const start = fakeScenarioJson().plan!.waypoints.find((w) => w.role === "start")!;
    const cell = cellIndex(loadMock().grid, start.x_m, start.y_m);
    expect(Number.isFinite(cell)).toBe(true);
    const HARD_HAZARD = 1 << 1; // 05 FLAG_BITS
    const dir = siteCopy((m, d) => rewriteAsset(m, d, m.grid.flags_asset, (b) => (b[cell!] = b[cell!]! | HARD_HAZARD)));
    const err = rejection(scenarioForMock(), ref(dir));
    expect(err.check).toBe("start_blocked");
    expect(err.message).toContain(start.id);
  });

  it("rejects a vehicle start on an impassable cell, naming the vehicle", () => {
    const { grid } = loadMock();
    const blocked = grid.elevation.findIndex((v) => Number.isNaN(v)); // a no-data cell of the mock DEM
    expect(blocked).toBeGreaterThanOrEqual(0);
    const c = centreOf(MOCK, blocked);
    const scenarioDir = scenarioForMock((s) => {
      s.vehicles[0]!.start_x_m = c.x_m;
      s.vehicles[0]!.start_y_m = c.y_m;
    });
    const err = rejection(scenarioDir, ref(siteCopy()));
    expect(err.check).toBe("start_blocked");
    expect(err.message).toContain(fakeScenarioJson().vehicles[0]!.vehicle_id);
  });

  it("rejects a vehicle start outside the grid", () => {
    const scenarioDir = scenarioForMock((s) => {
      s.vehicles[0]!.start_x_m = MOCK.grid.origin_m[0] - MOCK.grid.cell_m;
    });
    const err = rejection(scenarioDir, ref(siteCopy()));
    expect(err.check).toBe("start_blocked");
    expect(err.message).toContain(fakeScenarioJson().vehicles[0]!.vehicle_id);
  });

  it("treats non-finite start coordinates as off the grid (compute's cellIndex returns NaN, not null)", () => {
    // A scenario.json cannot hold NaN, so this calls the check directly.
    const { grid } = loadMock();
    const base = fakeScenarioJson();
    const params = Object.fromEntries(["pr1-assumed"].map((id) => [id, JSON.parse(readFileSync(join(fixtureDir, "param_sets", `${id}.json`), "utf8"))]));
    expect(() => checkStarts(base, params, grid)).not.toThrow();
    const nan = { ...base, vehicles: [{ ...base.vehicles[0]!, start_x_m: Number.NaN }] };
    expect(() => checkStarts(nan, params, grid)).toThrow(ScenarioCheckError);
    const inf = { ...base, vehicles: [{ ...base.vehicles[0]!, start_y_m: Number.POSITIVE_INFINITY }] };
    expect(() => checkStarts(inf, params, grid)).toThrow(ScenarioCheckError);
  });

  it("judges a vehicle start by the vehicle's own slope limit, not the crew's", () => {
    const { grid } = loadMock();
    const params = JSON.parse(readFileSync(join(fixtureDir, "param_sets", "pr1-assumed.json"), "utf8"));
    const crewLimit = fakeScenarioJson().plan!.scenario.hard_slope_limit_deg;
    const rover = vehiclePassable(grid, params);
    const k = rover.findIndex((ok, idx) => ok === 1 && !isCellPassable(grid, idx, crewLimit));
    expect(k).toBeGreaterThanOrEqual(0); // the mock site has a slope band between the two limits
    const c = centreOf(MOCK, k);
    const scenarioDir = scenarioForMock((s) => {
      s.vehicles[0]!.start_x_m = c.x_m;
      s.vehicles[0]!.start_y_m = c.y_m;
    });
    expect(readScenario(scenarioDir, ref(siteCopy())).grid).not.toBeNull();
  });
});

describe("the engine on a loaded site grid (T22.11 follow-up)", () => {
  it("one tick at the replayed surge raises the radiation warning and proposes options, without throwing", () => {
    const fake = readScenario(fixtureDir, SITE);
    const { grid, comm } = loadMock();
    const sc: LoadedScenario = { ...fake, grid, comm }; // built directly: the fake scenario's data_version is not the mock site's
    const [x0, y0, x1, y1] = MOCK.aoi.extent_m;
    for (const w of sc.scenario.plan!.waypoints) expect(w.x_m >= x0 && w.x_m <= x1 && w.y_m >= y0 && w.y_m <= y1).toBe(true);

    // The second consecutive high sample of the replayed series raises RADIATION_ALERT (02 §D.13); its time comes from the fixture.
    const times = sc.dose.samples.map(([t, r]) => [Date.parse(t), r] as const);
    const step = times[1]![0] - times[0]![0];
    const high = times.find(([, r]) => r !== times[0]![1])![0];
    const sim_time = new Date(high + step).toISOString().replace(".000Z", "Z");
    const started = reduce(initialState(sc, "s-0001"), { seq: 1, sim_time: sc.scenario.start_utc, kind: "EVA_STARTED", actor: "ops", data: { crew_ids: ["EV1", "EV2"], plan_revision: 1 }, provenance: {}, command_ref: null });
    const state: EngineState = { ...started, session: { ...started.session, clock: { ...started.session.clock, sim_time } } };

    const r = tick(state, sc, 1, state.session.last_seq + 1);
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toContain("ALERT_RAISED");
    const proposed = r.events.find((e) => e.kind === "OPTIONS_PROPOSED");
    expect(proposed, `events: ${kinds.join(", ")}`).toBeDefined();
    expect((proposed!.data as LogEventData["OPTIONS_PROPOSED"]).options.length).toBeGreaterThan(0);
  });
});

// ---- review round (9 Nov): TI sidecar on its own grid, path containment, asset format and bytes, start rules ----

/** Rewrite the TI asset as a coarser grid: `factor` times larger cells, so width/height shrink by `factor` (derived from the manifest). */
function coarseTi(m: Site, dir: string, factor: number): { width: number; height: number } {
  const ti = assetOf(m, m.grid.ti_asset!);
  const width = m.grid.width / factor;
  const height = m.grid.height / factor;
  const bytes = Buffer.alloc(width * height * Float32Array.BYTES_PER_ELEMENT);
  writeFileSync(join(dir, ti.path), bytes);
  Object.assign(ti, { width, height, bytes: bytes.length, sha256: sha256Bytes(bytes) });
  m.grid.ti_cell_m = m.grid.cell_m * factor;
  return { width, height };
}

describe("loadSite: the TI sidecar is its own coarse grid (05 RoutingGrid ti_asset, ti_cell_m)", () => {
  it("loads a TI asset whose width and height are not the grid's", () => {
    let ti = { width: 0, height: 0 };
    const dir = siteCopy((m, d) => {
      ti = coarseTi(m, d, 2);
    });
    expect(ti.width).toBeLessThan(MOCK.grid.width);
    const { grid } = loadSite(dir, MOCK.site_id, MOCK.data_version);
    expect(grid.ti!.length).toBe(ti.width * ti.height);
    expect(grid.elevation.length).toBe(MOCK.grid.width * MOCK.grid.height);
  });

  it("rejects a TI asset whose width x height does not match its file", () => {
    const dir = siteCopy((m, d) => {
      coarseTi(m, d, 2);
      assetOf(m, m.grid.ti_asset!).width! += 1;
    });
    const err = siteRejection(dir);
    expect(err.check).toBe("grid_dims");
    expect(err.message).toContain(MOCK.grid.ti_asset!);
  });
});

describe("loadSite: asset paths, format and bytes (review)", () => {
  it("rejects an asset path that leaves the site folder, relative or absolute", () => {
    for (const path of ["../outside.u8", join(tmpdir(), "outside.u8")]) {
      const dir = siteCopy((m) => {
        assetOf(m, m.grid.flags_asset).path = path;
      });
      const err = siteRejection(dir);
      expect(err.check, path).toBe("grid_asset");
      expect(err.message).toContain(MOCK.grid.flags_asset);
    }
  });

  it("rejects a path into a sibling folder whose name starts with the site folder's", () => {
    const dir = siteCopy((m, d) => {
      assetOf(m, m.grid.flags_asset).path = `../${basename(d)}-evil/flags.u8`;
    });
    expect(siteRejection(dir).check).toBe("grid_asset");
  });

  it("rejects an asset whose format is not the array's type", () => {
    const dir = siteCopy((m) => {
      Object.assign(assetOf(m, m.grid.flags_asset), { format: "f32", nodata: null }); // as the site schema allows an f32 array
    });
    const err = siteRejection(dir);
    expect(err.check).toBe("grid_dims");
    expect(err.message).toContain(MOCK.grid.flags_asset);
  });

  it("rejects an asset whose recorded bytes differ from its file", () => {
    const dir = siteCopy((m) => {
      assetOf(m, m.grid.comm_hab_asset).bytes! += 1;
    });
    const err = siteRejection(dir);
    expect(err.check).toBe("grid_dims");
    expect(err.message).toContain(MOCK.grid.comm_hab_asset);
  });

  it("refuses to run on a big-endian host (the manifest and typed-array views are little-endian)", () => {
    const spy = vi.spyOn(os, "endianness").mockReturnValue("BE");
    try {
      expect(siteRejection(MOCK_SITE_DIR).check).toBe("grid_endian");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("checkStarts rules (review)", () => {
  const params = () => ({ "pr1-assumed": JSON.parse(readFileSync(join(fixtureDir, "param_sets", "pr1-assumed.json"), "utf8")) });

  it("a plan without a start waypoint is an error, not a skipped check", () => {
    const base = fakeScenarioJson();
    const noStart = { ...base, plan: { ...base.plan!, waypoints: base.plan!.waypoints.filter((w) => w.role !== "start") } };
    let err: unknown;
    try {
      checkStarts(noStart, params(), loadMock().grid);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ScenarioCheckError);
    expect((err as ScenarioCheckError).check).toBe("start_missing");
  });

  it("a vehicle whose ParamSet is not a rover's has its own reason, not start_blocked", () => {
    const base = fakeScenarioJson();
    const suit = JSON.parse(readFileSync(join(fixtureDir, "param_sets", "suit-assumed.json"), "utf8"));
    let err: unknown;
    try {
      checkStarts(base, { "pr1-assumed": suit }, loadMock().grid);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ScenarioCheckError);
    expect((err as ScenarioCheckError).check).toBe("vehicle_params");
    expect((err as ScenarioCheckError).message).toContain(base.vehicles[0]!.vehicle_id);
  });
});
