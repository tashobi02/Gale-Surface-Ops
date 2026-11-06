/**
 * T22.02: the fake scenario fixture (F8) validates against the repo schemas and its derived values
 * (table SHA-256s, plan_hash) match what the generator wrote. Mock data under `mock_site`.
 *
 * ajv comes through fastify (a declared hab-core dependency).
 * TODO(decision): declare `ajv` and `ajv-formats` directly in the next dependency batch (T14.01);
 * the scenario loader (T22.11) also needs them.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import type { DoseSeries, EarthLinkTable, ParamSet, Scenario } from "@marswalk/protocol";

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

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validator = (schema: string) => ajv.compile(readJson(join(root, "schemas", schema)));

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
    const { data_version, scenario: mission, waypoints } = scenario.plan;
    expect(sha256(canonical({ data_version, scenario: mission, waypoints })).slice(0, 12)).toBe(scenario.plan.plan_hash);
  });

  it("stop tasks name stop Waypoints, 1–4 per stop (FR-50, U-61)", () => {
    const stops = new Set(scenario.plan.waypoints.filter((w) => w.role === "stop").map((w) => w.id));
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

  it("is mock data: site_id mock_site, synthetic source, dose integral consistent", () => {
    expect(scenario.site_id).toBe("mock_site");
    expect(scenario.plan.site_id).toBe("mock_site");
    const dose = readJson<DoseSeries>(join(here, "dose_series.json"));
    expect(dose.source_id).toBe("fixture-synthetic");
    expect(dose.integral_check.computed_ugy).toBe(dose.integral_check.expected_ugy);
    const earth = readJson<EarthLinkTable>(join(here, "earth_link.json"));
    expect(earth.rows.length).toBe(1);
  });
});
