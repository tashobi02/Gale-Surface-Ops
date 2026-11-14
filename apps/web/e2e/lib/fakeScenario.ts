/// <reference types="node" />
/**
 * Workaround for N-01 (frontend plan 01-needs-from-backend): `hab:start` only reads `scenarios/<id>`, and the Hab Core test
 * fixture names the data_version `mock_site-fixture`, not the one the committed F4 site carries. This copies the fixture to
 * `scenarios/e2e-fake/` (git-ignored, removed at teardown) and re-points its data_version at the site manifest's, then
 * recomputes `plan_hash` the way 05 PlanExport defines it. The Hab Core re-verifies the hash on load (scenario check
 * `plan_hash`), so a wrong rewrite fails at start, not silently.
 *
 * The copy also gets a declared synthetic Earth-link table (see `syntheticEarthLink`): the fixture's own table has no relay
 * pass at all, so `SEND_MESSAGE` is refused with BUSY and no Earth message could ever be delivered. The synthetic table is
 * the shape the backend's own Earth test declares (`apps/hab-core/tests/earth.test.ts`), so the harness exercises the real
 * delivery rule without inventing a science value. It is a fixture, not a measurement: `provenance` stays `derived`.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EarthLinkTable } from "@marswalk/protocol";

export const FAKE_SCENARIO_ID = "e2e-fake";

/** Canonical JSON for the plan hash: keys sorted, no whitespace (the Hab Core's `canonicalJson`, restricted to JSON values). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

interface PlanLike {
  data_version: string;
  plan_hash: string;
  scenario: unknown;
  waypoints: unknown;
}

/** The hash 05 PlanExport defines: first 12 hex characters of SHA-256 over the canonical {data_version, scenario, waypoints}. */
export function planHash(plan: Pick<PlanLike, "data_version" | "scenario" | "waypoints">): string {
  const { data_version, scenario, waypoints } = plan;
  return createHash("sha256").update(canonical({ data_version, scenario, waypoints })).digest("hex").slice(0, 12);
}

export function fakeScenarioDir(repoRoot: string): string {
  return join(repoRoot, "scenarios", FAKE_SCENARIO_ID);
}

// ---- the declared synthetic Earth-link table ---------------------------------------------------------------------

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Constant light time of the declared shape (10 min). */
const LIGHT_S = 600;
/** Relay pass starts, relative to the scenario start: +30 min, +3 h, +6 h. */
export const EARTH_PASS_STARTS_MS = [30 * MIN, 3 * HOUR, 6 * HOUR];
/** Relay pass length (20 min). */
export const EARTH_PASS_LEN_MS = 20 * MIN;
/** The orbiters of those passes, in the same order. */
const EARTH_ORBITERS = ["mro", "maven", "mro"] as const;
/** Rows cover the whole EVA window (12 h) plus a minute. */
const EARTH_ROWS_HOURS = 12;

/**
 * The declared synthetic Earth-link table of the harness copy: constant 10 min light time, three 20-minute relay passes at
 * +30 min, +3 h and +6 h, and one row per minute for 12 h. The shape is the one the backend's Earth test declares
 * (`apps/hab-core/tests/earth.test.ts`, lines 48-63); the numbers are a fixture's shape, not a measurement, so the table
 * keeps `provenance: "derived"`.
 *
 * The delivery rule this table exposes is `packages/compute/src/earthLink.ts`: Earth → Mars delivers at
 * `next_pass_start(t_send + light_time)`, so a message sent between passes waits for the next one.
 */
export function syntheticEarthLink(startUtc: string): EarthLinkTable {
  const t0 = Date.parse(startUtc);
  const rows: EarthLinkTable["rows"] = [];
  for (let t = 0; t <= EARTH_ROWS_HOURS * HOUR; t += MIN) {
    rows.push({
      t_utc: new Date(t0 + t).toISOString(),
      light_time_s: LIGHT_S,
      sep_angle_deg: 90,
      earth_elev_deg: 0,
      orbiters: { mro: 0, maven: 0, tgo: 0 },
    });
  }
  const passes = EARTH_PASS_STARTS_MS.map((start, index) => ({
    orbiter: EARTH_ORBITERS[index],
    start_utc: new Date(t0 + start).toISOString(),
    end_utc: new Date(t0 + start + EARTH_PASS_LEN_MS).toISOString(),
    max_elev_deg: 40,
  }));
  return { step_s: 60, rows, passes, kernels: [], provenance: "derived" };
}

/** Writes the synthetic table into the copy and returns the SHA-256 of its file text (the scenario check `table_sha256`). */
export function writeSyntheticEarthLink(target: string, startUtc: string): string {
  const text = `${JSON.stringify(syntheticEarthLink(startUtc), null, 2)}\n`;
  writeFileSync(join(target, "earth_link.json"), text);
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Copy the fixture and match it to `siteId`'s manifest. Returns the scenario id to pass to `--scenario`. */
export function prepareFakeScenario(repoRoot: string, siteId: string): string {
  const source = join(repoRoot, "apps/hab-core/tests/fixtures/fake-scenario");
  const target = fakeScenarioDir(repoRoot);
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });

  const manifest = JSON.parse(readFileSync(join(repoRoot, "data/sites", siteId, "site-manifest.json"), "utf8")) as {
    data_version: string;
    hab_candidates?: unknown[];
  };
  const path = join(target, "scenario.json");
  const scenario = JSON.parse(readFileSync(path, "utf8")) as {
    data_version: string;
    start_utc: string;
    plan: PlanLike;
    tables: { earth_link: { path: string; sha256: string } };
    mission_setup?: { hab_candidate_id?: string };
  };
  scenario.data_version = manifest.data_version;
  // The Hab Core refuses a `hab_candidate_id` when the site has no `hab_candidates` (scenario check `hab_candidate`, 05 Scenario);
  // the F4 mock site has none, so the copy omits the id (FD-236).
  if (!Array.isArray(manifest.hab_candidates) || manifest.hab_candidates.length === 0) delete scenario.mission_setup?.hab_candidate_id;
  scenario.plan.data_version = manifest.data_version;
  scenario.plan.plan_hash = planHash(scenario.plan);
  // The fixture's Earth-link table has no relay pass, so `SEND_MESSAGE` is refused (BUSY) and no Earth message could ever
  // arrive. The copy gets the declared synthetic table instead, with the hash the scenario check `table_sha256` verifies.
  scenario.tables.earth_link.sha256 = writeSyntheticEarthLink(target, scenario.start_utc);
  writeFileSync(path, `${JSON.stringify(scenario, null, 2)}\n`);
  return FAKE_SCENARIO_ID;
}

export function removeFakeScenario(repoRoot: string): void {
  const target = fakeScenarioDir(repoRoot);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
