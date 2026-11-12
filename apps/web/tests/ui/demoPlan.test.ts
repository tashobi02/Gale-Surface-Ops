import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validatePlanInput } from "@marswalk/compute";
import type { MissionScenario } from "@marswalk/protocol";
import demoPlan from "../../src/ui/demoPlan.json";

// T07.14 (TASK-07; 01 §E; FR-06, FR-45; 02 §E.3). The demo plan references POIs and the site
// default start by id/name and carries no coordinates, so it cannot drift from the site bundle.
const HERE = dirname(fileURLToPath(import.meta.url));
const POI_DIR = join(HERE, "../../../../pipeline/sites/gale_boxwork/pois");
const PARAM_SET_DIR = join(HERE, "../../../../scenarios/storm-sol4190/param_sets");

// Hand copy of the 05 §C MissionScenario defaults table, so it can drift from 05; update both together.
// eva_start_utc has no default ("site default", TASK-07 open point 7).
// Note: validatePlanInput does not type-check crew_count beyond 1|2, nor vehicle_param_set, and
// checks loop and vehicle_available only as booleans, so the tests below also compare exact values.
const DEFAULTS: Omit<MissionScenario, "eva_start_utc"> = {
  max_eva_duration_h: 6.0,
  dwell_min_per_stop: 20,
  hard_slope_limit_deg: 15,
  caution_slope_deg: 10,
  walkback_limit_km: 5.0,
  suited_flat_speed_kmh: 3.3,
  solar_phase: "max",
  loop: true,
  max_haven_min: 30,
  crew_count: 2,
  vehicle_available: true,
  vehicle_param_set: "pr1-assumed",
};

function poiRecord(id: string): { poi_id: string; stop_type: string } {
  return JSON.parse(readFileSync(join(POI_DIR, `${id}.json`), "utf8"));
}

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

describe("demo plan (T07.14)", () => {
  const stops = demoPlan.stops;

  it("names exactly three stops, at most 10 allowed by 02 §E.3, with unique ids", () => {
    expect(stops).toHaveLength(3);
    expect(stops.length).toBeLessThanOrEqual(10);
    expect(new Set(stops).size).toBe(3);
  });

  it("every stop is a curated POI file whose poi_id matches its file name", () => {
    for (const id of stops) {
      expect(existsSync(join(POI_DIR, `${id}.json`)), id).toBe(true);
      expect(poiRecord(id).poi_id).toBe(id);
    }
  });

  it("starts at the boxwork ridge and includes at least one resource stop (FR-45)", () => {
    expect(stops[0]).toBe("poi-boxwork-ridge");
    expect(stops.map((id) => poiRecord(id).stop_type)).toContain("resource");
  });

  it("stop 2 is the resource stop where the crew are during the storm (01 §E.1, §E.2 steps 3-5)", () => {
    expect(poiRecord(stops[1]).stop_type).toBe("resource");
  });

  it("starts from the site default_start by name and copies no coordinates", () => {
    expect(demoPlan.start).toBe("default_start");
    const forbidden = new Set([
      "x_m", "y_m", "x", "y", "lat", "lon", "lon_e", "latitude", "longitude",
      "coordinates", "position", "easting", "northing",
    ]);
    expect(keysDeep(demoPlan).filter((k) => forbidden.has(k))).toEqual([]);
  });

  it("scenario values lie inside 02 §E.3", () => {
    expect(validatePlanInput(demoPlan.scenario as Partial<MissionScenario>)).toEqual([]);
  });

  it("scenario has exactly the 05 MissionScenario keys except eva_start_utc (no unknown keys)", () => {
    expect(Object.keys(demoPlan.scenario).sort()).toEqual(Object.keys(DEFAULTS).sort());
  });

  it("vehicle_param_set names an existing ParamSet file in the storm scenario", () => {
    const id = demoPlan.scenario.vehicle_param_set;
    expect(existsSync(join(PARAM_SET_DIR, `${id}.json`)), id).toBe(true);
  });

  it("every non-default scenario value has a recorded reason", () => {
    const scenario = demoPlan.scenario as Record<string, unknown>;
    const reasons = Object.keys(demoPlan.notes.non_default_reasons);
    const nonDefault = Object.entries(DEFAULTS)
      .filter(([k, v]) => scenario[k] !== v)
      .map(([k]) => k);
    expect(nonDefault.sort()).toEqual(reasons.sort());
  });

  it("does not invent eva_start_utc: it stays empty and the decision is recorded (FD-042)", () => {
    expect(demoPlan.scenario).not.toHaveProperty("eva_start_utc");
    expect(demoPlan.notes.decisions.join(" ")).toContain("eva_start_utc");
  });

  it("the recorded decisions name the dose the screen shows, not a narrated number (FD-043)", () => {
    expect(demoPlan.notes.decisions.join(" ")).toContain("the dose shown");
    // The narrated 0.19 mSv of 01 §E.2 step 8 is gone: the screen shows the computed dose.
    expect(demoPlan.notes.decisions.join(" ")).not.toContain("0.19 mSv");
  });

  it("no TODO marker is left in the file", () => {
    const text = JSON.stringify(demoPlan);
    expect(text).not.toContain("TODO(");
  });
});
