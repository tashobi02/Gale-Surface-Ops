/**
 * Scenario loading and validation (docs/specs/05 §C.2 Scenario, 02 §E.7). Contract C14, frozen by
 * T22.01; implementation T22.11. Checks the schema, site_id and data_version, plan_hash, table
 * SHA-256s, passable starts, and that every `stop_tasks[].stop_id` is a stop Waypoint with 1–4 tasks
 * per stop (FR-50, U-61). TASK-21 owns the format.
 */
import type { LoadedGrid } from "@marswalk/compute";
import type { DoseSeries, EarthLinkTable, ParamSet, Scenario } from "@marswalk/protocol";

export interface LoadedScenario {
  scenario: Scenario;
  dose: DoseSeries;
  earthLink: EarthLinkTable;
  /** Keyed by `param_set_id`; includes one `link`, `alert` and `shielding` set (05 Scenario). */
  params: Record<string, ParamSet>;
  /** The site's routing grid; null for the fake scenario (T22.02), which has no site data. */
  grid: LoadedGrid | null;
  /**
   * Static hab comm coverage (05 RoutingGrid `comm_hab_asset`: u8, 1 = line of sight to the hab mast,
   * 0 = none, 255 = no data) and the mast it was computed for (`hab_mast`). Used by links.ts (T26.01).
   * null when no site is loaded.
   */
  comm: { comm_hab: Uint8Array; hab_mast: { x_m: number; y_m: number; height_m: number } } | null;
}

/** The loaded site the scenario must match (05 Scenario `site_id`, `data_version`). */
export interface SiteRef {
  site_id: string;
  data_version: string;
  /** Directory of `data/sites/<site_id>`; null when no site is loaded (fake scenario). */
  dir: string | null;
}

/** Thrown with the failed check and a reason (02 §E.7). */
export class ScenarioCheckError extends Error {
  constructor(
    readonly check: string,
    message: string,
  ) {
    super(message);
  }
}

/** Read and validate `<dir>/scenario.json` and its tables. T22.11. */
export function readScenario(dir: string, site: SiteRef): LoadedScenario {
  throw new Error("TODO(TASK-22): T22.11 not implemented");
}
