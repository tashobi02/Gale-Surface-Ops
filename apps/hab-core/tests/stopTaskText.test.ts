/**
 * T31.02 (TASK-31; FR-50, FR-45; 05 StopTask, Scenario `stop_tasks`; U-58, U-52): the authored task
 * text of the storm-sol4190 demo plan, `scenarios/storm-sol4190/stop_tasks.json`. The text is team
 * content, so these tests check shape only: schema, length, counts, the stop mapping and that no
 * number slipped in uncited. They do not judge wording; Sadman Shaharier Mahim approves that.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../../..");
const SCENARIO_DIR = join(ROOT, "scenarios/storm-sol4190");
const TASKS_FILE = join(SCENARIO_DIR, "stop_tasks.json");
const DEMO_PLAN = join(ROOT, "apps/web/src/ui/demoPlan.json");
const POI_DIR = join(ROOT, "pipeline/sites/gale_boxwork/pois");

interface Seed {
  task_id: string;
  stop_id: string;
  crew_id: "EV1" | "EV2" | null;
  kind: string;
  text: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const schema = readJson<{ $id: string }>(join(ROOT, "schemas/scenario.schema.json"));
const tasks = (): Seed[] => readJson<Seed[]>(TASKS_FILE);
const stops = (): string[] => readJson<{ stops: string[] }>(DEMO_PLAN).stops;
// Walking order, start is wp-0 (05 Waypoint `wp-<n>`; the demo plan builder T21.12 numbers stops from 1).
const waypointOf = (poiId: string): string => `wp-${stops().indexOf(poiId) + 1}`;

describe("stop_tasks.json (T31.02)", () => {
  it("exists and is a non-empty array", () => {
    expect(existsSync(TASKS_FILE)).toBe(true);
    expect(Array.isArray(tasks())).toBe(true);
    expect(tasks().length).toBeGreaterThan(0);
  });

  it("every task validates against StopTaskSeed in scenario.schema.json", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
    addFormats(ajv);
    ajv.addSchema(schema);
    const validate = ajv.getSchema(`${schema.$id}#/$defs/StopTaskSeed`);
    expect(validate).toBeDefined();
    for (const t of tasks()) {
      expect(validate!(t), `${t.task_id}: ${JSON.stringify(validate!.errors)}`).toBe(true);
    }
  });

  it("task_id values are unique", () => {
    const ids = tasks().map((t) => t.task_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("text is imperative-length: 1 to 60 characters, trimmed, one line", () => {
    for (const t of tasks()) {
      expect(t.text.length, t.task_id).toBeGreaterThan(0);
      expect(t.text.length, `${t.task_id}: ${t.text.length} chars`).toBeLessThanOrEqual(60);
      expect(t.text, t.task_id).toBe(t.text.trim());
      expect(t.text, t.task_id).not.toMatch(/[\r\n]/);
    }
  });

  it("text contains no digits (a number needs a source, FR-50, 01 §C.4)", () => {
    for (const t of tasks()) expect(t.text, t.task_id).not.toMatch(/\d/);
  });

  it("kind and crew_id use the 05 enums", () => {
    for (const t of tasks()) {
      expect(["observe", "image", "sample", "measure", "deploy", "other"], t.task_id).toContain(t.kind);
      expect(["EV1", "EV2", null], t.task_id).toContain(t.crew_id);
    }
  });

  it("every demo-plan stop has 1 to 4 tasks and no task names another stop", () => {
    const perStop = new Map<string, number>();
    for (const t of tasks()) perStop.set(t.stop_id, (perStop.get(t.stop_id) ?? 0) + 1);
    const expected = stops().map((_, i) => `wp-${i + 1}`);
    expect([...perStop.keys()].sort()).toEqual([...expected].sort());
    for (const [stop, n] of perStop) {
      expect(n, stop).toBeGreaterThanOrEqual(1);
      expect(n, stop).toBeLessThanOrEqual(4);
    }
  });

  it("stop_id is the stop Waypoint id (U-61), numbered in demo-plan walking order", () => {
    for (const t of tasks()) expect(t.stop_id, t.task_id).toMatch(/^wp-[1-9]\d*$/);
    expect(waypointOf("poi-boxwork-ridge")).toBe("wp-1");
    expect(waypointOf("poi-sulfate-contact")).toBe("wp-2");
    expect(waypointOf("poi-monte-grande-hollow")).toBe("wp-3");
  });

  it("task_id carries its stop number (t-s<n>-<nn>, as in 05 StopTask)", () => {
    for (const t of tasks()) {
      const n = t.stop_id.replace("wp-", "");
      expect(t.task_id, t.task_id).toMatch(new RegExp(`^t-s${n}-0[1-4]$`));
    }
  });

  it("each demo-plan stop's POI exists and has a science objective the tasks derive from", () => {
    for (const poi of stops()) {
      const record = readJson<{ poi_id: string; science_objective: string }>(join(POI_DIR, `${poi}.json`));
      expect(record.poi_id).toBe(poi);
      expect(record.science_objective.length).toBeGreaterThan(0);
    }
  });

  it("has no extra fields (state, origin and provenance are set by the Hab Core)", () => {
    for (const t of tasks()) expect(Object.keys(t).sort()).toEqual(["crew_id", "kind", "stop_id", "task_id", "text"]);
  });
});

describe("storm-sol4190 stop_tasks.md record (T31.02)", () => {
  const record = (): string => readFileSync(join(SCENARIO_DIR, "stop_tasks.md"), "utf8");

  it("records U-58 (who writes the text, where) and U-52 (per-crew model)", () => {
    expect(record()).toMatch(/U-58/);
    expect(record()).toMatch(/U-52/);
    expect(record()).toMatch(/stop_tasks\.json/);
    expect(record()).toMatch(/t-s2-04/);
    expect(record()).toMatch(/wp-1/);
  });
});
