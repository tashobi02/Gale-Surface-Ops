/// <reference types="node" />
/**
 * Workaround for N-01 (frontend plan 01-needs-from-backend): `hab:start` only reads `scenarios/<id>`, and the Hab Core test
 * fixture names the data_version `mock_site-fixture`, not the one the committed F4 site carries. This copies the fixture to
 * `scenarios/e2e-fake/` (git-ignored, removed at teardown) and re-points its data_version at the site manifest's, then
 * recomputes `plan_hash` the way 05 PlanExport defines it. The Hab Core re-verifies the hash on load (scenario check
 * `plan_hash`), so a wrong rewrite fails at start, not silently.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

/** Copy the fixture and match it to `siteId`'s manifest. Returns the scenario id to pass to `--scenario`. */
export function prepareFakeScenario(repoRoot: string, siteId: string): string {
  const source = join(repoRoot, "apps/hab-core/tests/fixtures/fake-scenario");
  const target = fakeScenarioDir(repoRoot);
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });

  const manifest = JSON.parse(readFileSync(join(repoRoot, "data/sites", siteId, "site-manifest.json"), "utf8")) as {
    data_version: string;
  };
  const path = join(target, "scenario.json");
  const scenario = JSON.parse(readFileSync(path, "utf8")) as { data_version: string; plan: PlanLike };
  scenario.data_version = manifest.data_version;
  scenario.plan.data_version = manifest.data_version;
  scenario.plan.plan_hash = planHash(scenario.plan);
  writeFileSync(path, `${JSON.stringify(scenario, null, 2)}\n`);
  return FAKE_SCENARIO_ID;
}

export function removeFakeScenario(repoRoot: string): void {
  const target = fakeScenarioDir(repoRoot);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
