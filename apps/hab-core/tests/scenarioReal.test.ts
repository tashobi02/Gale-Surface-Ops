/**
 * T21.08, T32.32, T22.13 (TASK-21, TASK-22, TASK-32; FR-34, FR-50, FR-52, NFR-06; 02 §E.7; BD-10, BD-97, BD-98, BD-143,
 * BD-144): the real `scenarios/storm-sol4190/scenario.json` loads through the Hab Core loader on the real `gale_boxwork`
 * bundle, and its `series_start_utc` is the one compute's `triggerState` gives (the Python builder is cross-checked here
 * against the TypeScript compute core). The loader group is skipped, with the reason printed, when the bundle's grid is absent
 * (clean clone, CI); the compute cross-check needs only committed files and always runs.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { triggerState } from "@marswalk/compute";
import type { DoseSeries, ParamSet, Scenario } from "@marswalk/protocol";
import { readScenario } from "../src/scenario";
import { siteRefFor } from "../src/replay";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../../..");
const DIR = join(ROOT, "scenarios/storm-sol4190");
const hasRealGrid = existsSync(join(ROOT, "data/sites/gale_boxwork/grid/elevation.f32"));
if (!hasRealGrid) console.log("scenarioReal: loader checks skipped, data/sites/gale_boxwork/grid/ is absent");
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

describe("T21.08 series_start_utc against compute triggerState (BD-98, BD-143)", () => {
  const scenario = readJson<Scenario>(join(DIR, "scenario.json"));
  const series = readJson<DoseSeries>(join(DIR, "dose_series.json"));
  const alert = readJson<ParamSet>(join(DIR, "param_sets/alert-assumed.json"));
  const entry = scenario.event_library![0]!;
  const firstAlert = series.samples.findIndex(([t]) => triggerState(series, t, alert) === "alert");

  it("the first sample compute calls an alert is the 2024-05-20T05:50:32Z sample of 01 §E.1", () => {
    expect(firstAlert).toBeGreaterThan(0);
    expect(series.samples[firstAlert]![0]).toBe("2024-05-20T05:50:32Z");
    expect(triggerState(series, series.samples[firstAlert - 1]![0], alert)).toBe("nominal");
  });

  it("series_start_utc is the last sample below rad_clear_k x background_rate before that sample", () => {
    const clear = (alert.values.rad_clear_k as number) * series.background_rate;
    let want = "";
    for (let i = 0; i < firstAlert; i++) if (series.samples[i]![1] !== null && series.samples[i]![1]! < clear) want = series.samples[i]![0];
    expect(entry.series_start_utc).toBe(want);
  });

  it("the press at t0 = series_start_utc is after the sim clock starts and before the alert (BD-97)", () => {
    expect(Date.parse(entry.series_start_utc)).toBeGreaterThan(Date.parse(scenario.start_utc));
    expect(Date.parse(entry.series_start_utc)).toBeLessThan(Date.parse(series.samples[firstAlert]![0]));
  });
});

describe.skipIf(!hasRealGrid)("T21.08 / T22.13 the loader accepts the real scenario on the real bundle", () => {
  const load = () => readScenario(DIR, siteRefFor("gale_boxwork"));

  it("loads: schema, plan_hash, table checksums, ParamSets, stop tasks and the passable crew and vehicle start cells", () => {
    const loaded = load();
    expect(loaded.scenario.scenario_id).toBe("storm-sol4190");
    expect(loaded.grid).not.toBeNull();
    expect(loaded.eventLibrary).toHaveLength(1);
    expect(loaded.taskLibrary).toHaveLength(10);
    expect(Object.keys(loaded.params)).toEqual(expect.arrayContaining(["suit-assumed", "pr1-assumed", "link-assumed", "alert-assumed", "shielding-assumed"]));
  });

  it("the hab site is the rank-1 candidate and its mast is where the vehicles start (BD-10)", () => {
    const loaded = load();
    const first = loaded.site!.hab_candidates.find((c) => c.rank === 1)!;
    expect(loaded.scenario.mission_setup!.hab_candidate_id).toBe(first.candidate_id);
    expect(loaded.comm!.hab_mast).toMatchObject({ x_m: first.hab_mast.x_m, y_m: first.hab_mast.y_m });
    for (const v of loaded.scenario.vehicles) expect([v.start_x_m, v.start_y_m]).toEqual([first.hab_mast.x_m, first.hab_mast.y_m]);
  });

  it("every library task names a POI of the site's pois.geojson", () => {
    const pois = readJson<{ features: { properties: { poi_id: string } }[] }>(join(ROOT, "data/sites/gale_boxwork/vectors/pois.geojson"));
    const ids = new Set(pois.features.map((f) => f.properties.poi_id));
    for (const t of load().taskLibrary) expect(ids.has(t.poi_id)).toBe(true);
  });
});
