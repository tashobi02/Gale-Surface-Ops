/**
 * T21.12 (TASK-21; FR-34, NFR-06; 06 §D.1; BD-106, BD-142, BD-144): the demo PlanExport is built headlessly by
 * `scripts/build-demo-plan.ts`, a thin layer over `@marswalk/compute`. Three groups:
 * (a) the pieces on a small site (the committed F4 mock site) and on synthetic route functions;
 * (b) the committed `scenarios/storm-sol4190/plan.json`: schema, hash, rebuilt twice with the same bytes, with no
 *     wall-clock field; skipped, with the reason printed, when the real bundle's grid is absent;
 * (c) the T21.15 rule the script applies: the committed plan's start is the stop-2 dwell rule's value.
 * Expected values come from the committed files or from the schema; none is typed.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { MissionScenario, PlanExport } from "@marswalk/protocol";
import { canonicalJson } from "../src/log";
import { checkPlan, loadSite } from "../src/scenario";
import { deriveDemoTiming, loadInputs } from "../scripts/demo-numbers";
import {
  PROTOTYPE_DISCLAIMER,
  buildDemoPlan,
  planHashOf,
  resolveDemoWaypoints,
  smallestRoutableLimit,
} from "../scripts/build-demo-plan";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../../..");
const REAL_SITE = join(ROOT, "data/sites/gale_boxwork");
const MOCK_SITE = join(ROOT, "data/sites/mock_site");
const PLAN_FILE = join(ROOT, "scenarios/storm-sol4190/plan.json");
const hasRealGrid = existsSync(join(REAL_SITE, "grid/elevation.f32"));
if (!hasRealGrid) console.log("buildDemoPlan: real-grid checks skipped, data/sites/gale_boxwork/grid/ is absent");

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "marswalk-demoplan-"));
  dirs.push(d);
  return d;
};
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

describe("T21.12 (a) resolveDemoWaypoints", () => {
  const start = { x_m: 10, y_m: 20, label: "Habitat / rover" };
  const pois = [
    { poi_id: "poi-a", name: "A", x_m: 1, y_m: 2 },
    { poi_id: "poi-b", name: "B", x_m: 3, y_m: 4 },
  ];

  it("gives wp-0 the site's default start and wp-n the nth stop POI, in demo order, with its poi_id", () => {
    const wps = resolveDemoWaypoints(start, pois, ["poi-b", "poi-a"]);
    expect(wps.map((w) => [w.id, w.role, w.x_m, w.y_m, w.poi_id])).toEqual([
      ["wp-0", "start", 10, 20, undefined],
      ["wp-1", "stop", 3, 4, "poi-b"],
      ["wp-2", "stop", 1, 2, "poi-a"],
    ]);
  });

  it("throws, naming the POI, when a demo stop is not in the site: no coordinate is invented", () => {
    expect(() => resolveDemoWaypoints(start, pois, ["poi-a", "poi-missing"])).toThrow(/poi-missing/);
  });

  it("throws on an empty stop list", () => {
    expect(() => resolveDemoWaypoints(start, pois, [])).toThrow(/stops/);
  });
});

describe("T21.12 (a) smallestRoutableLimit (BD-142)", () => {
  const routes = (okFrom: number) => (limit: number) => ({ status: limit >= okFrom ? "OK" : "PARTIAL", legs: [{ status: limit >= okFrom ? "OK" : "NO_ROUTE" }] });

  it("returns the starting limit when it already routes, and calls the router once", () => {
    let calls = 0;
    expect(smallestRoutableLimit(15, 35, (l) => (calls++, routes(15)(l)))).toBe(15);
    expect(calls).toBe(1);
  });

  it("raises in whole degrees to the smallest limit at which every leg routes", () => {
    expect(smallestRoutableLimit(15, 35, routes(24))).toBe(24);
    expect(smallestRoutableLimit(15, 35, routes(35))).toBe(35);
  });

  it("an OVER_LIMITS plan still counts as routed: only a NO_ROUTE leg raises the limit", () => {
    expect(smallestRoutableLimit(15, 35, (l) => ({ status: "OVER_LIMITS", legs: [{ status: l >= 20 ? "OK" : "NO_ROUTE" }] }))).toBe(20);
  });

  it("throws, naming both limits, when no limit up to the maximum routes", () => {
    expect(() => smallestRoutableLimit(15, 25, routes(26))).toThrow(/15.*25/);
  });

  it("rejects a starting limit above the maximum", () => {
    expect(() => smallestRoutableLimit(36, 35, routes(1))).toThrow(RangeError);
  });
});

describe("T21.12 (a) planHashOf", () => {
  const scenario = { eva_start_utc: "2024-05-20T04:00:00Z" } as unknown as MissionScenario;
  it("is the first 12 hex of SHA-256 over the RFC 8785 JSON of {data_version, scenario, waypoints} (05 PlanExport)", () => {
    const waypoints = [{ id: "wp-0", role: "start" as const, x_m: 1, y_m: 2 }];
    const want = createHash("sha256").update(canonicalJson({ data_version: "v", scenario, waypoints })).digest("hex").slice(0, 12);
    expect(planHashOf("v", scenario, waypoints)).toBe(want);
  });
});

describe("T21.12 (a) the export carries the web app's disclaimer", () => {
  it("equals PROTOTYPE_DISCLAIMER in apps/web/src/ui/content/disclaimer.ts word for word", () => {
    // The web app's single home for the 01 §F.1 statement (FD-509); it starts with a `${PRODUCT_NAME}` template part.
    const source = readFileSync(join(ROOT, "apps/web/src/ui/content/disclaimer.ts"), "utf8");
    const name = /export const PRODUCT_NAME = "([^"]*)";/.exec(source)![1]!;
    const block = /export const PROTOTYPE_DISCLAIMER =([\s\S]*?);\n/.exec(source)![1]!;
    const parts = [...block.matchAll(/"((?:[^"\\]|\\.)*)"|`([^`]*)`/g)];
    const web = parts
      .map((m) => (m[1] !== undefined ? (JSON.parse(`"${m[1]}"`) as string) : m[2]!.replace("${PRODUCT_NAME}", name)))
      .join("");
    expect(web.startsWith(`${name} is an exploratory hackathon prototype.`)).toBe(true);
    expect(PROTOTYPE_DISCLAIMER).toBe(web);
  });
});

describe("T21.12 (a) a plan built on the mock site", () => {
  const built = () => buildDemoPlan({ root: ROOT, siteDir: MOCK_SITE, stops: ["poi-boxwork-ridge"], scenario: readJson<{ scenario: Omit<MissionScenario, "eva_start_utc"> }>(join(ROOT, "apps/web/src/ui/demoPlan.json")).scenario, startUtc: "2024-05-20T04:00:00Z" });

  it("validates against plan-export.schema.json and its own plan_hash (checkPlan) and has no wall-clock field", () => {
    const { plan } = built();
    expect(() => checkPlan(plan)).not.toThrow();
    expect(plan.result).not.toHaveProperty("computed_utc");
    expect(plan.result).not.toHaveProperty("timing_ms");
    expect(plan.disclaimer).toBe(PROTOTYPE_DISCLAIMER);
    expect(plan.scenario.eva_start_utc).toBe("2024-05-20T04:00:00Z");
    expect(plan.site_id).toBe("mock_site");
    expect(plan.data_version).toBe(readJson<{ data_version: string }>(join(MOCK_SITE, "site-manifest.json")).data_version);
  });

  it("two runs give the same bytes and the same plan_hash", () => {
    const a = built();
    const b = built();
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
    expect(a.plan.plan_hash).toBe(b.plan.plan_hash);
  });

  it("the plan_hash changes when the start time changes (the hash covers the scenario)", () => {
    const other = buildDemoPlan({ root: ROOT, siteDir: MOCK_SITE, stops: ["poi-boxwork-ridge"], scenario: built().plan.scenario, startUtc: "2024-05-20T05:00:00Z" });
    expect(other.plan.plan_hash).not.toBe(built().plan.plan_hash);
  });

  it("keeps the limit of the demo plan file when the legs already route, and says so", () => {
    const { search, plan } = built();
    expect(search.limit_deg).toBe(search.from_deg);
    expect(plan.scenario.hard_slope_limit_deg).toBe(search.limit_deg);
  });

  it("provenance_summary lists only values the export carries, each with a provenance and source ids", () => {
    const { plan } = built();
    expect(plan.provenance_summary.length).toBeGreaterThan(0);
    for (const e of plan.provenance_summary) {
      expect(["measured", "derived", "modelled", "assumed", "replayed", "simulated"]).toContain(e.provenance);
      expect(e.source_ids.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!hasRealGrid)("T21.12 (b) the committed plan.json on the real grid", () => {
  const committed = (): PlanExport => readJson<PlanExport>(PLAN_FILE);

  it("exists, validates against plan-export.schema.json and verifies its plan_hash", () => {
    expect(existsSync(PLAN_FILE)).toBe(true);
    expect(() => checkPlan(committed())).not.toThrow();
  });

  it("is for the loaded site's data_version, with the start, the three demo stops by POI id and the return leg", () => {
    const plan = committed();
    const site = loadSite(REAL_SITE, "gale_boxwork", readJson<{ data_version: string }>(join(REAL_SITE, "site-manifest.json")).data_version).manifest;
    expect(plan.site_id).toBe("gale_boxwork");
    expect(plan.data_version).toBe(site.data_version);
    const demo = readJson<{ stops: string[]; start: string }>(join(ROOT, "apps/web/src/ui/demoPlan.json"));
    expect(plan.waypoints.map((w) => w.id)).toEqual(["wp-0", "wp-1", "wp-2", "wp-3"]);
    expect(plan.waypoints[0]).toMatchObject({ role: "start", x_m: site.default_start.x_m, y_m: site.default_start.y_m });
    expect(plan.waypoints.slice(1).map((w) => w.poi_id)).toEqual(demo.stops);
    expect(plan.result.legs).toHaveLength(plan.waypoints.length); // loop: true adds the return leg
    expect(plan.result.legs.every((l) => l.status === "OK")).toBe(true);
  });

  it("has the smallest hard slope limit at which every leg routes: one degree lower leaves a leg without a route (BD-142)", () => {
    const plan = committed();
    const demo = readJson<{ scenario: Omit<MissionScenario, "eva_start_utc"> }>(join(ROOT, "apps/web/src/ui/demoPlan.json")).scenario;
    expect(plan.scenario.hard_slope_limit_deg).toBeGreaterThan(demo.hard_slope_limit_deg);
    const lower = buildDemoPlan({ root: ROOT, siteDir: REAL_SITE, scenario: { ...demo, hard_slope_limit_deg: plan.scenario.hard_slope_limit_deg - 1 }, startUtc: plan.scenario.eva_start_utc, fixedLimit: true });
    expect(lower.plan.result.legs.some((l) => l.status !== "OK")).toBe(true);
  });

  it("rebuilding gives the committed bytes and the committed plan_hash (deterministic, no clock)", () => {
    const rebuilt = buildDemoPlan({ root: ROOT, siteDir: REAL_SITE }).plan;
    expect(rebuilt.plan_hash).toBe(committed().plan_hash);
    expect(`${JSON.stringify(rebuilt, null, 2)}\n`).toBe(readFileSync(PLAN_FILE, "utf8"));
  }, 60_000);

  it("scenario.eva_start_utc is the T21.15 stop-2 dwell rule's value for this plan (the walk times do not depend on the start)", () => {
    const plan = committed();
    const timing = deriveDemoTiming({ ...loadInputs(ROOT, { withPlan: false }), plan });
    expect(timing.eva?.eva_start_utc).toBe(plan.scenario.eva_start_utc);
    expect(timing.eva?.matches_plan_eva_start_utc).toBe(true);
  });

  it("the plan's result carries conditions for the start day (sol 4190)", () => {
    expect(committed().result.conditions?.sol).toBe(4190);
  });
});
