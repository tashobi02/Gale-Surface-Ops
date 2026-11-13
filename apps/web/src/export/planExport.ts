/**
 * Plan serialization and canonical export JSON generator (05 §C PlanExport, FR-14).
 *
 * The export is the file a crew takes away: scenario, waypoints, the computed result, the provenance
 * of every value it carries and the prototype disclaimer. It validates against
 * `schemas/plan-export.schema.json`.
 *
 * The hash (FD-134): the first 12 hex characters of SHA-256 over the RFC 8785 canonical JSON of
 * `{data_version, scenario, waypoints}` — the same rule the Hab Core applies, so the plan that reaches
 * ops carries the hash the planner computed. The digest is pure TypeScript (`export/sha256.ts`), so a
 * LAN `http://` origin without a secure context hashes too (FD-141).
 *
 * The versions (FD-140): `export_schema_version` is the version of `schemas/plan-export.schema.json`
 * this file implements, and `app_version` is `apps/web/package.json`'s version at build time.
 *
 * The profile arrays are stored in the export (FD-004, U-11): SCR-08 renders from the export, so it
 * needs them.
 */
import type { PlanExport, Provenance, Site } from "@marswalk/protocol";
import type { PlanState } from "../state/planStore";
import { canonicalJson } from "./jcs";
import { sha256Hex } from "./sha256";
import webPackage from "../../package.json";
import provenanceMap from "../ui/content/provenanceMap.json";

/** The version of `schemas/plan-export.schema.json` this file implements (FD-140). */
export const EXPORT_SCHEMA_VERSION = "1.0.0";

/** `app_version`: the web app's own version (FD-140). */
export const APP_VERSION: string = webPackage.version;

/**
 * The prototype disclaimer (01 §F.1): it must appear in the app, and the export carries it (TASK-11
 * spec question 3, FD-135: the card footer and the export carry the full text).
 */
export const PROTOTYPE_DISCLAIMER =
  "Marswalk Surface Ops is an exploratory hackathon prototype. It is not astronaut operations software. " +
  "Crew, suit, rover and vehicle states are simulated. Solar events are real historical records replayed " +
  "on a simulated clock — not a live feed from Mars. Slope limits, speeds, consumables and shelter values " +
  "are illustrative assumptions from Earth and Apollo-era references. Radio coverage is line-of-sight only.";

/** The provenance of every value the export carries, with the source ids it comes from. */
export interface ProvenanceEntry {
  value_path: string;
  provenance: Provenance;
  source_ids: string[];
}

/** What the hash is computed over (05 §C PlanExport): the data version, the scenario and the waypoints. */
export interface PlanHashInput {
  data_version: string;
  scenario: unknown;
  waypoints: unknown;
}

/**
 * The plan hash: the first 12 hex characters of SHA-256 over the canonical JSON of
 * `{data_version, scenario, waypoints}` (05 §C, FD-134).
 */
export function planHash(input: PlanHashInput): string {
  const canonical = canonicalJson({
    data_version: input.data_version,
    scenario: input.scenario,
    waypoints: input.waypoints,
  });
  return sha256Hex(canonical).slice(0, 12);
}

/** The result fields the export keeps (05 §C PlanResult): the message envelope is not part of it. */
function resultOf(state: PlanState): PlanExport["result"] {
  const result = state.result;
  if (!result) throw new Error("exportPlan: the plan has no computed result yet");
  return {
    status: result.status,
    legs: result.legs,
    totals: result.totals,
    stops_timeline: result.stops_timeline,
    warnings: result.warnings,
    // `computed_utc` and `timing_ms` describe the worker run; the export schema leaves them optional
    // (a plan may be embedded without a run) but a computed result always has them.
    computed_utc: result.computed_utc,
    timing_ms: result.timing_ms,
    ...(result.conditions ? { conditions: result.conditions } : {}),
    ...(result.radiation ? { radiation: result.radiation } : {}),
  };
}

/** The shared provenance map supplies the class and source of every carried value. */
function provenanceSummary(plan: Pick<PlanExport, "result" | "scenario">): ProvenanceEntry[] {
  return Object.entries({ ...provenanceMap.result, ...provenanceMap.scenario })
    .filter(([path]) => path.split(".").reduce<unknown>(
      (value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined,
      plan,
    ) != null)
    .map(([value_path, entry]) => ({ value_path, provenance: entry.provenance as Provenance, source_ids: [...entry.source_ids] }));
}

/**
 * Assemble the export of the current plan.
 *
 * The site's `site_id` and `data_version` come from the manifest (05 §C Site); the plan's scenario,
 * waypoints and result come from the store. The stop tasks are not in the export: they travel beside the
 * plan in `PUBLISH_PLAN` (BD-91), so editing a task never changes `plan_hash` (U-48).
 */
export function exportPlan(site: Pick<Site, "site_id" | "data_version">, state: PlanState): PlanExport {
  const result = resultOf(state);
  if (!["OK", "OverLimits", "Partial"].includes(state.status)) {
    throw new Error("exportPlan: no computed result for the current plan revision");
  }
  return {
    export_schema_version: EXPORT_SCHEMA_VERSION,
    app_version: APP_VERSION,
    site_id: site.site_id,
    data_version: site.data_version,
    plan_hash: planHash({ data_version: site.data_version, scenario: state.scenario, waypoints: state.waypoints }),
    scenario: state.scenario,
    waypoints: state.waypoints,
    result,
    provenance_summary: provenanceSummary({ result, scenario: state.scenario }),
    disclaimer: PROTOTYPE_DISCLAIMER,
  };
}

/** The export as the JSON text of the downloaded file (indented, so the file is readable). */
export function exportPlanJson(exported: PlanExport): string {
  return `${JSON.stringify(exported, null, 2)}\n`;
}

/** The file name of the downloaded export. */
export function exportFileName(site: Site): string {
  return `plan-${site.site_id}-${site.data_version}.json`;
}
