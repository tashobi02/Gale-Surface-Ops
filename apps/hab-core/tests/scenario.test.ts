/**
 * T22.11: scenario loader checks (docs/specs/05 Scenario, §E.7; 02 §E.7; FR-34, FR-50, NFR-10).
 * Each rejection reason has one named test. Every case copies the fake scenario (F8, T22.02) to a
 * temporary folder and breaks one thing; the fixture itself is never edited.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Scenario } from "@marswalk/protocol";
import { readScenario, ScenarioCheckError, type SiteRef } from "../src/scenario";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/fake-scenario");
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
      s.plan.scenario.dwell_min_per_stop = 25;
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
      s.events = [{ ...s.events[0], event_id: "e2", t_utc: "2024-05-20T02:00:00Z" }, s.events[0]];
    });
    expect(rejection(dir).check).toBe("events_order");
  });
});
