/**
 * Scenario loading and validation (docs/specs/05 §C.2 Scenario, §E.7). Checks site_id and
 * data_version, plan_hash, table SHA-256s, passable starts. TASK-21 (format), TASK-22 (loader).
 */
import type { DoseSeries, EarthLinkTable, ParamSet, Scenario } from "@marswalk/protocol";

export interface LoadedScenario {
  scenario: Scenario;
  dose: DoseSeries;
  earthLink: EarthLinkTable;
  params: Record<string, ParamSet>;
}

export function readScenario(dir: string): LoadedScenario {
  throw new Error("TODO(TASK-22): not implemented");
}
