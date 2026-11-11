/**
 * Plan serialization and canonical export JSON generator (05 §C PlanExport, FR-14).
 * Stub for T11.02.
 */
import type { PlanExport, Site } from "@marswalk/protocol";
import type { PlanState } from "../state/planStore";

export function exportPlan(site: Site, state: PlanState): PlanExport {
  throw new Error("TODO(T11.02): exportPlan not implemented");
}
