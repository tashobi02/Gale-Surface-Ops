/**
 * T22.02: the fake scenario fixture (F8) validates against the repo schemas and its derived values
 * (table SHA-256s, plan_hash) match what the generator wrote. Mock data under `mock_site`.
 *
 * `ajv` and `ajv-formats` are declared hab-core dependencies (T14.01; decided, BD-79); the scenario loader (T22.11) uses them too.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { inverseEqc, triggerState } from "@marswalk/compute";
import type { DoseSeries, EarthLinkTable, ParamSet, Scenario, Site } from "@marswalk/protocol";
import { loadSite } from "../../../src/scenario";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../../..");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Canonical JSON: sorted keys, no whitespace (05 PlanExport plan_hash). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

// Strict, except two rules that reject valid schema patterns used in schemas/ (if/then required, union types).
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
addFormats(ajv);
const compiled = new Map<string, ReturnType<typeof ajv.compile>>();
const validator = (schema: string) => {
  let validate = compiled.get(schema);
  if (!validate) compiled.set(schema, (validate = ajv.compile(readJson(join(root, "schemas", schema)))));
  return validate;
};

const scenario = readJson<Scenario>(join(here, "scenario.json"));

describe("fake scenario fixture (T22.02, F8)", () => {
  it("scenario.json validates against schemas/scenario.schema.json", () => {
    const validate = validator("scenario.schema.json");
    expect(validate(scenario), JSON.stringify(validate.errors)).toBe(true);
  });

  it("plan validates against schemas/plan-export.schema.json", () => {
    const validate = validator("plan-export.schema.json");
    expect(validate(scenario.plan), JSON.stringify(validate.errors)).toBe(true);
  });

  it("every listed ParamSet exists and validates; link, alert and shielding are present (05 Scenario)", () => {
    const validate = validator("param-set.schema.json");
    const kinds = scenario.param_sets.map((id) => {
      const p = readJson<ParamSet>(join(here, "param_sets", `${id}.json`));
      expect(validate(p), `${id} ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(p.param_set_id).toBe(id);
      return p.kind;
    });
    expect(kinds).toEqual(expect.arrayContaining(["link", "alert", "shielding"]));
  });

  it("table SHA-256s match the files (05 §E.7)", () => {
    for (const table of Object.values(scenario.tables)) {
      expect(sha256(readFileSync(join(here, table.path), "utf8")), table.path).toBe(table.sha256);
    }
  });

  it("plan_hash = first 12 hex of SHA-256 over canonical {data_version, scenario, waypoints} (05 PlanExport)", () => {
    const { data_version, scenario: mission, waypoints } = scenario.plan!;
    expect(sha256(canonical({ data_version, scenario: mission, waypoints })).slice(0, 12)).toBe(scenario.plan!.plan_hash);
  });

  it("stop tasks name stop Waypoints, 1–4 per stop (FR-50, U-61)", () => {
    const stops = new Set(scenario.plan!.waypoints.filter((w) => w.role === "stop").map((w) => w.id));
    const perStop = new Map<string, number>();
    for (const t of scenario.stop_tasks ?? []) {
      expect(stops.has(t.stop_id), t.task_id).toBe(true);
      perStop.set(t.stop_id, (perStop.get(t.stop_id) ?? 0) + 1);
    }
    for (const n of perStop.values()) {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it("every referenced ParamSet is listed, events are sorted (05 Scenario)", () => {
    const listed = new Set(scenario.param_sets);
    for (const c of scenario.crew) expect(listed.has(c.suit_param_set), c.crew_id).toBe(true);
    for (const v of scenario.vehicles) expect(listed.has(v.param_set), v.vehicle_id).toBe(true);
    const vps = scenario.plan!.scenario.vehicle_param_set;
    if (vps) expect(listed.has(vps)).toBe(true);
    const times = scenario.events!.map((e) => Date.parse(e.t_utc));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("a loop plan has one leg per waypoint pair plus the return leg, and OK has totals (05 PlanResult)", () => {
    const { result, waypoints, scenario: mission } = scenario.plan!;
    expect(result.legs.length).toBe(waypoints.length - 1 + (mission.loop ? 1 : 0));
    if (result.status === "OK") expect(result.totals).not.toBeNull();
  });

  it("is mock data: site_id mock_site, synthetic source, dose integral consistent", () => {
    expect(scenario.site_id).toBe("mock_site");
    expect(scenario.plan!.site_id).toBe("mock_site");
    const dose = readJson<DoseSeries>(join(here, "dose_series.json"));
    expect(dose.source_id).toBe("fixture-synthetic");
    // Independent recompute: each sample's rate holds until the next sample (piecewise constant).
    let integral = 0;
    for (let i = 0; i + 1 < dose.samples.length; i++) {
      const dt_h = (Date.parse(dose.samples[i + 1][0]) - Date.parse(dose.samples[i][0])) / 3_600_000;
      expect(dt_h, "dose samples strictly increasing (05 DoseSeries)").toBeGreaterThan(0);
      integral += (dose.samples[i][1] ?? 0) * dt_h;
    }
    expect(dose.integral_check.computed_ugy).toBeCloseTo(integral, 9);
    const earth = readJson<EarthLinkTable>(join(here, "earth_link.json"));
    expect(earth.rows.length).toBe(1);
  });
});

// ---- Live-session shape (backend package 01b: T32.04, T32.05; contract §8, §9) -----------------------------------

const planless = readJson<Scenario>(join(here, "scenario.planless.json"));
const twoCandidateDir = join(here, "two-candidate-site");
const doseSeries = readJson<DoseSeries>(join(here, "dose_series.json"));

describe("fake scenario, live shape (T32.05)", () => {
  it("carries mission_setup from the 05 §F.4 values and the first candidate id", () => {
    expect(scenario.mission_setup).toEqual({
      hab_candidate_id: "hab-first",
      crew_count: scenario.plan!.scenario.crew_count,
      vehicle_available: scenario.plan!.scenario.vehicle_available,
      vehicle_param_set: scenario.plan!.scenario.vehicle_param_set,
      solar_phase: scenario.plan!.scenario.solar_phase,
      max_haven_min: scenario.plan!.scenario.max_haven_min,
    });
    expect(scenario.mission_setup.crew_count).toBe(scenario.crew.length);
  });

  it("has one event_library entry `storm` over the synthetic step series, labelled as a fixture", () => {
    expect(scenario.event_library.map((e) => e.event_id)).toEqual(["storm"]);
    const storm = scenario.event_library[0];
    expect(storm).toMatchObject({ kind: "SPACE_WEATHER", dose_series: "dose_series", provenance: "replayed", source_id: "fixture-synthetic" });
    expect(storm.label).toMatch(/fixture/i);
    expect(Object.keys(scenario.tables)).toContain(storm.dose_series);
  });

  it("series_start_utc follows BD-98: the last sample at or below the background before the first non-nominal sample", () => {
    const alertParams = readJson<ParamSet>(join(here, "param_sets", "alert-assumed.json"));
    const storm = scenario.event_library[0];
    const firstAlert = doseSeries.samples.findIndex(([t]) => triggerState(doseSeries, t, alertParams) !== "nominal");
    expect(firstAlert).toBeGreaterThan(0);
    let last = -1;
    for (let i = 0; i < firstAlert; i++) if ((doseSeries.samples[i][1] ?? Infinity) <= doseSeries.background_rate) last = i;
    expect(last).toBeGreaterThanOrEqual(0);
    expect(storm.series_start_utc).toBe(doseSeries.samples[last][0]);
  });

  it("task_library names POIs of the mock site, at most 60 characters each, and any digit has a source_id (BD-101)", () => {
    const pois = readJson<{ features: { properties: { poi_id: string } }[] }>(join(root, "data/sites/mock_site/vectors/pois.geojson"));
    const ids = new Set(pois.features.map((f) => f.properties.poi_id));
    expect(scenario.task_library?.length).toBeGreaterThanOrEqual(1);
    const libraryIds = new Set<string>();
    for (const e of scenario.task_library ?? []) {
      expect(ids.has(e.poi_id), e.library_task_id).toBe(true);
      expect(e.text.length).toBeLessThanOrEqual(60);
      if (/[0-9]/.test(e.text)) expect(e.source_id, e.library_task_id).toBeTruthy();
      expect(libraryIds.has(e.library_task_id), "unique library_task_id").toBe(false);
      libraryIds.add(e.library_task_id);
    }
  });

  it("keeps the old reference shape: plan, stop tasks and the Earth event stay (replay hashes depend on the plan)", () => {
    expect(scenario.plan!.plan_hash).toHaveLength(12);
    expect(scenario.stop_tasks?.length).toBe(2);
    expect(scenario.events!.map((e) => e.event_id)).toEqual(["e1"]);
  });
});

describe("plan-less variant (T32.05)", () => {
  it("validates, has no plan, stop_tasks or events, and shares tables, crew and setup with scenario.json", () => {
    const validate = validator("scenario.schema.json");
    expect(validate(planless), JSON.stringify(validate.errors)).toBe(true);
    expect(planless).not.toHaveProperty("plan");
    expect(planless).not.toHaveProperty("stop_tasks");
    expect(planless).not.toHaveProperty("events");
    expect(planless.tables).toEqual(scenario.tables);
    expect(planless.crew).toEqual(scenario.crew);
    expect(planless.mission_setup).toEqual(scenario.mission_setup);
    expect(planless.event_library).toEqual(scenario.event_library);
    expect(planless.scenario_id).not.toBe(scenario.scenario_id);
  });
});

describe("schemas/scenario.schema.json v2 (T32.04)", () => {
  const validate = validator("scenario.schema.json");
  const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(scenario)) as Record<string, unknown>;
  const ok = (v: unknown): boolean => validate(v) === true;

  it("accepts both shipped variants", () => {
    expect(ok(scenario)).toBe(true);
    expect(ok(planless)).toBe(true);
  });

  it("requires mission_setup and event_library", () => {
    for (const key of ["mission_setup", "event_library"]) {
      const s = clone();
      delete s[key];
      expect(ok(s), `without ${key}`).toBe(false);
    }
  });

  it("makes plan and events optional, but stop_tasks needs plan", () => {
    const noPlan = clone();
    delete noPlan.plan;
    expect(ok(noPlan), "stop_tasks without plan").toBe(false);
    delete noPlan.stop_tasks;
    expect(ok(noPlan), "plan-less without stop_tasks").toBe(true);
    const noEvents = clone();
    delete noEvents.events;
    expect(ok(noEvents)).toBe(true);
  });

  it("checks mission_setup ranges from 02 §E.3 (inclusive) and enums", () => {
    const set = (patch: Record<string, unknown>): boolean => {
      const s = clone();
      s.mission_setup = { ...(s.mission_setup as object), ...patch };
      return ok(s);
    };
    expect(set({ crew_count: 0 })).toBe(false);
    expect(set({ crew_count: 1 })).toBe(true);
    expect(set({ crew_count: 3 })).toBe(false);
    expect(set({ max_haven_min: 4 })).toBe(false);
    expect(set({ max_haven_min: 5 })).toBe(true);
    expect(set({ max_haven_min: 120 })).toBe(true);
    expect(set({ max_haven_min: 121 })).toBe(false);
    expect(set({ solar_phase: "mid" })).toBe(false);
    expect(set({ vehicle_available: "yes" })).toBe(false);
    expect(set({ vehicle_param_set: null })).toBe(true);
    expect(set({ unknown_key: 1 })).toBe(false);
    const empty = clone();
    empty.mission_setup = {};
    expect(ok(empty), "every key optional").toBe(true);
  });

  it("checks event_library: at least one entry, t_offset_s >= 0, source_id unless simulated", () => {
    const withLibrary = (library: unknown): boolean => {
      const s = clone();
      s.event_library = library;
      return ok(s);
    };
    const entry = scenario.event_library[0];
    expect(withLibrary([])).toBe(false);
    expect(withLibrary([entry])).toBe(true);
    const input = { input_id: "i1", t_offset_s: 0, kind: "EARTH_MESSAGE", payload: { body: "x" }, provenance: "simulated" };
    expect(withLibrary([{ ...entry, inputs: [input] }])).toBe(true);
    expect(withLibrary([{ ...entry, inputs: [{ ...input, t_offset_s: -1 }] }])).toBe(false);
    expect(withLibrary([{ ...entry, inputs: [{ ...input, provenance: "replayed" }] }]), "replayed input without source_id").toBe(false);
    expect(withLibrary([{ ...entry, inputs: [{ ...input, provenance: "replayed", source_id: "donki-2024-05" }] }])).toBe(true);
    expect(withLibrary([{ ...entry, kind: "OTHER" }])).toBe(false);
  });

  it("checks task_library: text <= 60 characters, crew_id EV1, EV2 or null, kind from the StopTask enum", () => {
    const withTask = (patch: Record<string, unknown>): boolean => {
      const s = clone();
      s.task_library = [{ ...(scenario.task_library as object[])[0], ...patch }];
      return ok(s);
    };
    expect(withTask({})).toBe(true);
    expect(withTask({ text: "x".repeat(60) })).toBe(true);
    expect(withTask({ text: "x".repeat(61) })).toBe(false);
    expect(withTask({ text: "" })).toBe(false);
    expect(withTask({ crew_id: "EV3" })).toBe(false);
    expect(withTask({ crew_id: null })).toBe(true);
    expect(withTask({ kind: "dance" })).toBe(false);
  });

  it("documents that the cross-field rules belong to the loader", () => {
    const schema = readJson<{ $comment: string }>(join(root, "schemas", "scenario.schema.json"));
    expect(schema.$comment).toMatch(/loader/);
  });
});

describe("two-candidate site (T32.05)", () => {
  const manifest = readJson<Site>(join(twoCandidateDir, "site-manifest.json"));

  it("the manifest validates against schemas/site-manifest.schema.json and has two candidates, one rank 1", () => {
    const validate = validator("site-manifest.schema.json");
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    const candidates = manifest.hab_candidates ?? [];
    expect(candidates.map((c) => c.candidate_id)).toEqual(["hab-first", "hab-alternative"]);
    expect(candidates.map((c) => c.rank)).toEqual([1, 2]);
  });

  it("rank-1 mirrors the Site fields; the other candidate has its own mast and comm grid (05 HabCandidate)", () => {
    const [first, second] = manifest.hab_candidates ?? [];
    expect(first.hab_mast).toEqual(manifest.grid.hab_mast);
    expect(first.comm_hab_asset).toBe(manifest.grid.comm_hab_asset);
    expect(first.default_start).toEqual(manifest.default_start);
    expect(second.hab_mast).not.toEqual(first.hab_mast);
    expect(second.comm_hab_asset).toBe("grid-comm-hab-alternative");
    const byId = new Map(manifest.assets.map((a) => [a.asset_id, a]));
    const firstBytes = readFileSync(join(twoCandidateDir, byId.get(first.comm_hab_asset)?.path ?? "missing"));
    const secondAsset = byId.get(second.comm_hab_asset);
    expect(secondAsset?.path).toBe("grid/comm_hab-alternative.u8");
    const secondBytes = readFileSync(join(twoCandidateDir, secondAsset?.path ?? "missing"));
    expect(secondBytes.length).toBe(firstBytes.length);
    expect(Buffer.compare(secondBytes, firstBytes)).not.toBe(0);
    expect(createHash("sha256").update(secondBytes).digest("hex")).toBe(secondAsset?.sha256);
    expect(secondAsset?.bytes).toBe(secondBytes.length);
  });

  it("candidate lat and lon_e are the inverse working projection of the mast (compute inverseEqc)", () => {
    const m = /\+lat_ts=(-?[\d.]+) \+lat_0=(-?[\d.]+) \+lon_0=(-?[\d.]+)/.exec(manifest.crs.proj4);
    expect(m).not.toBeNull();
    const proj = { lat_ts: Number(m?.[1]), lat_0: Number(m?.[2]), lon_0: Number(m?.[3]) };
    for (const c of manifest.hab_candidates ?? []) {
      const expected = inverseEqc(c.hab_mast.x_m, c.hab_mast.y_m, proj);
      expect(c.lat).toBeCloseTo(expected.lat, 9);
      expect(c.lon_e).toBeCloseTo(expected.lon_e, 9);
    }
  });

  it("the Hab Core site loader reads it as the mock site (its own dated data_version; the fake scenario's is not a dated one)", () => {
    const loaded = loadSite(twoCandidateDir, scenario.site_id, manifest.data_version);
    expect(loaded.grid.meta.width * loaded.grid.meta.height).toBe(loaded.comm.comm_hab.length);
    expect(loaded.comm.hab_mast).toEqual(manifest.hab_candidates?.[0].hab_mast);
  });
});

describe("generator is deterministic (T32.05)", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { recursive: true, withFileTypes: false })
      .map(String)
      .filter((f) => statSync(join(dir, f)).isFile())
      .sort();
  const generate = (out: string): void => {
    const r = spawnSync("python3", [join(here, "make_fake_scenario.py"), "--out", out], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
  };

  it("two runs give identical bytes, and they equal the committed fixture files", () => {
    const a = mkdtempSync(join(tmpdir(), "fake-a-"));
    const b = mkdtempSync(join(tmpdir(), "fake-b-"));
    try {
      generate(a);
      generate(b);
      expect(files(a)).toEqual(files(b));
      expect(files(a)).toContain("scenario.planless.json");
      expect(files(a).some((f) => f.startsWith("two-candidate-site"))).toBe(true);
      for (const f of files(a)) {
        const bytes = readFileSync(join(a, f));
        expect(Buffer.compare(bytes, readFileSync(join(b, f))), `${f} differs between runs`).toBe(0);
        const committed = join(here, f);
        expect(existsSync(committed), `${relative(here, committed)} is committed`).toBe(true);
        expect(Buffer.compare(bytes, readFileSync(committed)), `${f} differs from the committed file`).toBe(0);
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});

