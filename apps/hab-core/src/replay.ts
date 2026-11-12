/**
 * Headless replay (NFR-14; 02 §F): run a scenario at full speed with no clients, write the log, and
 * return `log_hash`. Used by CI (determinism, NFR-06) and as the video fallback. T22.13.
 *
 * A run: load the scenario into a fresh session folder, START_EVA as ops, then 1-s steps until the
 * session ENDS or the plan's maximum EVA duration has passed. No client sends commands, so the run
 * is the scenario's own course (scheduled events and engine behaviour). The hash does not depend on
 * the folder, so two runs of the same scenario and seed print the same hash.
 */
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Scenario } from "@marswalk/protocol";
import { readScenario, ScenarioCheckError, type LoadedScenario, type SiteRef } from "./scenario";
import { loadSession } from "./session";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_VAR = join(REPO_ROOT, "apps/hab-core/var");
/** Steps per advance call; any size gives the same log (fixed 1-s steps). */
const CHUNK = 600;

export interface ReplayOptions {
  /** The site the scenario must match; default from `data/sites/<site_id>/site-manifest.json`. */
  site?: SiteRef;
  /** Where the replay's session folder goes; default `apps/hab-core/var/replay` (git-ignored). */
  varDir?: string;
}

/** The loaded site for `site_id`, from its manifest (05 Site `data_version`). */
export function siteRefFor(site_id: string, sitesDir = join(REPO_ROOT, "data/sites")): SiteRef {
  const dir = join(sitesDir, site_id);
  let manifest: { site_id?: string; data_version?: string };
  try {
    manifest = JSON.parse(readFileSync(join(dir, "site-manifest.json"), "utf8")) as typeof manifest;
  } catch {
    throw new ScenarioCheckError("site", `no site bundle at ${dir} (site-manifest.json); run the pipeline or fetch the release asset`);
  }
  if (manifest.site_id !== site_id || typeof manifest.data_version !== "string") {
    throw new ScenarioCheckError("site", `${dir}/site-manifest.json does not describe site ${site_id}`);
  }
  return { site_id, data_version: manifest.data_version, dir };
}

function scenarioSiteId(scenarioDir: string): string {
  try {
    return (JSON.parse(readFileSync(join(scenarioDir, "scenario.json"), "utf8")) as Scenario).site_id;
  } catch {
    throw new ScenarioCheckError("read", `cannot read ${join(scenarioDir, "scenario.json")} (scenario files come from TASK-21)`);
  }
}

/** Read the scenario, with `seed` replacing the scenario's seed when given. */
export function loadForReplay(scenarioDir: string, options: ReplayOptions = {}, seed?: number): LoadedScenario {
  const site = options.site ?? siteRefFor(scenarioSiteId(scenarioDir));
  const loaded = readScenario(scenarioDir, site);
  return seed === undefined ? loaded : { ...loaded, scenario: { ...loaded.scenario, seed } };
}

/** The run cannot start from what was given (a caller error, not a scenario fault); the CLI exits with code 2. */
export class ReplayInputError extends Error {}

export async function replayHeadless(scenarioDir: string, seed?: number, options: ReplayOptions = {}): Promise<string> {
  const loaded = loadForReplay(scenarioDir, options, seed);
  const reference = loaded.scenario.plan;
  // A live-session scenario has no plan until PUBLISH_PLAN; the command-list replay that supplies one is T32.17.
  if (reference === undefined) throw new ReplayInputError("scenario has no plan; pass --commands with a PUBLISH_PLAN");
  const base = join(options.varDir ?? DEFAULT_VAR, "replay");
  mkdirSync(base, { recursive: true });
  const session = loadSession(loaded, mkdtempSync(join(base, `${loaded.scenario.scenario_id}-`)));

  const start = session.apply({ command_id: "replay-start", role: "ops", kind: "START_EVA", args: {} }, "replay");
  if (!start.result.ok) throw new Error(`replay: START_EVA rejected: ${start.result.code} ${start.result.message}`);

  let remaining = Math.ceil(reference.scenario.max_eva_duration_h * 3600);
  // The reference run presses the storm at `series_start_utc`, so the series plays at its recorded UTC (U-62, BD-97, T32.12).
  // The recorded command list that replaces this fixed press is T32.17.
  const storm = (loaded.scenario.event_library ?? [])[0];
  if (storm !== undefined) {
    const lead_s = Math.max(0, Math.round((Date.parse(storm.series_start_utc) - Date.parse(loaded.scenario.start_utc)) / 1000));
    session.advance(Math.min(lead_s, remaining));
    remaining -= Math.min(lead_s, remaining);
    const press = session.apply({ command_id: "replay-storm", role: "presenter", kind: "START_EVENT", args: { event_id: storm.event_id } }, "replay");
    if (!press.result.ok) throw new Error(`replay: START_EVENT rejected: ${press.result.code} ${press.result.message}`);
  }
  while (remaining > 0 && session.snapshot([]).session.status === "RUNNING") {
    const steps = Math.min(CHUNK, remaining);
    session.advance(steps);
    remaining -= steps;
  }
  return session.snapshot([]).session.log_hash;
}
