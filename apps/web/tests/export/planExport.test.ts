/**
 * T11.01 / T11.02 (FD-134, FD-140, FD-004, 05 §C PlanExport, FR-14): the plan export is canonical,
 * schema-valid and reproducible.
 *
 * The three named checks of the package: `canonical numbers`, `schema valid`, `same plan same hash`.
 * The schema is `schemas/plan-export.schema.json` (the one 05 §C and the worker share), so an export
 * that drifts from it fails here rather than at the Hab Core.
 */
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { Leg, PlanExport, Site } from "@marswalk/protocol";
import planExportSchema from "../../../../schemas/plan-export.schema.json";
import { canonicalJson } from "../../src/export/jcs";
import { EXPORT_SCHEMA_VERSION, exportPlan, planHash } from "../../src/export/planExport";
import type { PlanState } from "../../src/state/planStore";
import { SCENARIO, WAYPOINTS, resultOf, stateOf } from "../ui/planStoreFake";
import { mockManifest } from "../ui/map/mapFixtures";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(planExportSchema);

/** The F4 mock site's own manifest (the file the app fetches), so the export reads the real ids. */
function siteOf(overrides: Partial<Site> = {}): Site {
  return { ...mockManifest(), ...overrides };
}

/** The one OK leg of the fixture plan (05 §C Leg; `cell_path_length` is the searched path length). */
function okLeg(): Leg {
  return {
    from: "wp-0",
    to: "wp-1",
    status: "OK",
    distance_m: 6120,
    walk_time_min: 128,
    climb_m: 74,
    descent_m: 74,
    max_slope_deg: 12.6,
    geometry: [
      [0, 0],
      [100, 100],
    ],
    cell_path_length: 6125,
    profile: {
      dist_m: [0, 50, 100],
      elev_m: [0, 1, 2],
      slope_class: ["ok", "caution", "ok"],
    },
  };
}

/** A plan state with a computed result, so the export has a `result` (05 §C requires it). */
function okState(overrides: Partial<PlanState> = {}): PlanState {
  return stateOf({
    status: "OK",
    result: resultOf({
      legs: [okLeg()],
      totals: {
        distance_m: 6120,
        walk_time_min: 128,
        dwell_time_min: 20,
        eva_total_min: 148,
        eva_margin_min: 212,
        climb_m: 74,
        descent_m: 74,
        max_slope_deg: 12.6,
        max_walkback_km: 3.06,
      },
    }),
    ...overrides,
  });
}

describe("plan export (T11.01, T11.02)", () => {
  it("canonical numbers", () => {
    // RFC 8785 (FD-134): keys sorted by UTF-16 code units at every level, no whitespace, numbers as
    // ECMAScript `Number::toString` writes them (1.0 -> 1, 1e21 -> 1e+21).
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}');
    expect(canonicalJson([1.0, 1e21, -0.5])).toBe("[1,1e+21,-0.5]");
    expect(canonicalJson({ n: 1.0 })).toBe('{"n":1}');
    expect(canonicalJson({ s: "a\"b" })).toBe('{"s":"a\\"b"}');
    expect(canonicalJson({ t: true, u: null })).toBe('{"t":true,"u":null}');
    // Arrays keep their order; only object keys are sorted.
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    // A property whose value is undefined is left out, as in JSON.stringify.
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    // A non-finite number is not a JSON number and throws rather than writing "null".
    expect(() => canonicalJson({ n: Number.NaN })).toThrow();
    expect(() => canonicalJson({ n: Number.POSITIVE_INFINITY })).toThrow();
  });

  it("canonical numbers: the hash input is {data_version, scenario, waypoints} in canonical JSON", () => {
    const state = okState();
    const site = siteOf();
    const hash = planHash({ data_version: site.data_version, scenario: state.scenario, waypoints: state.waypoints });
    // The same input in a different key order hashes the same.
    const reordered = planHash({
      waypoints: state.waypoints,
      scenario: state.scenario,
      data_version: site.data_version,
    });
    expect(reordered).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it("schema valid", () => {
    const exported = exportPlan(siteOf(), okState());
    const valid = validate(exported);
    if (!valid) throw new Error(`export does not validate: ${JSON.stringify(validate.errors, null, 2)}`);
    expect(valid).toBe(true);
  });

  it("schema valid: the export carries every field 05 §C requires", () => {
    const exported = exportPlan(siteOf(), okState());
    for (const key of [
      "export_schema_version",
      "app_version",
      "site_id",
      "data_version",
      "plan_hash",
      "scenario",
      "waypoints",
      "result",
      "provenance_summary",
      "disclaimer",
    ]) {
      expect(exported, key).toHaveProperty(key);
    }
    expect(exported.export_schema_version).toBe(EXPORT_SCHEMA_VERSION);
    expect(exported.export_schema_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(exported.app_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(exported.site_id).toBe("mock_site");
    expect(exported.data_version).toBe("mock_site-2026.11.05");
    expect(exported.disclaimer.length).toBeGreaterThan(0);
  });

  it("schema valid: the profile arrays are stored in the export (FD-004, U-11)", () => {
    const exported = exportPlan(siteOf(), okState());
    const leg = exported.result.legs[0];
    expect(leg?.status).toBe("OK");
    const profile = leg?.status === "OK" ? leg.profile : undefined;
    expect(profile).toBeDefined();
    expect(profile?.dist_m).toEqual([0, 50, 100]);
    expect(profile?.elev_m).toEqual([0, 1, 2]);
    expect(profile?.slope_class).toEqual(["ok", "caution", "ok"]);
    // The export still validates with the profile present (the schema keeps it optional, additive).
    expect(validate(exported)).toBe(true);
  });

  it("same plan same hash", () => {
    const site = siteOf();
    const state = okState();
    const a = exportPlan(site, state);
    const b = exportPlan(site, state);
    expect(a.plan_hash).toBe(b.plan_hash);
    expect(a.plan_hash).toBe(planHash({ data_version: site.data_version, scenario: state.scenario, waypoints: state.waypoints }));
  });

  it("same plan same hash: a changed scenario changes the hash", () => {
    const site = siteOf();
    const before = exportPlan(site, okState()).plan_hash;
    const after = exportPlan(site, okState({ scenario: { ...SCENARIO, max_eva_duration_h: 8 } })).plan_hash;
    expect(after).not.toBe(before);
  });

  it("same plan same hash: a moved waypoint changes the hash", () => {
    const site = siteOf();
    const before = exportPlan(site, okState()).plan_hash;
    const moved = WAYPOINTS.map((w) => (w.id === "wp-1" ? { ...w, x_m: 101 } : w));
    const after = exportPlan(site, okState({ waypoints: moved })).plan_hash;
    expect(after).not.toBe(before);
  });

  it("the provenance summary lists a class and source ids for every value path", () => {
    const exported = exportPlan(siteOf(), okState());
    expect(exported.provenance_summary.length).toBeGreaterThan(0);
    for (const entry of exported.provenance_summary) {
      expect(entry.value_path).toMatch(/^[A-Za-z0-9_.[\]]+$/);
      expect(["measured", "derived", "modelled", "assumed", "replayed", "simulated"]).toContain(entry.provenance);
      expect(Array.isArray(entry.source_ids)).toBe(true);
    }
  });

  it("the export is plain JSON: no undefined and no non-finite number", () => {
    const exported = exportPlan(siteOf(), okState());
    expect(() => JSON.parse(JSON.stringify(exported))).not.toThrow();
    expect(JSON.stringify(exported)).not.toContain("null,null");
  });

  it("an export without a computed result is refused (the schema needs a result)", () => {
    expect(() => exportPlan(siteOf(), okState({ status: "Empty", result: null }))).toThrow();
  });

  it("the export is a PlanExport of the protocol's type", () => {
    const exported: PlanExport = exportPlan(siteOf(), okState());
    expect(exported.waypoints).toEqual(WAYPOINTS);
  });
});
