/** Last computed PlanExport, browser-local only (05 §B/§E.4; FR-20; T18.07). */
import type { MissionScenario, PlanExport, Site, Waypoint } from "@marswalk/protocol";
import { validatePlanInput } from "@marswalk/compute";
import schema from "../../../../schemas/plan-export.schema.json";
import { EXPORT_SCHEMA_VERSION } from "../export/planExport";

export const LAST_PLAN_STORAGE_KEY = "mwp:lastPlan:v1";
export interface RestoredPlan { scenario: MissionScenario; waypoints: Waypoint[] }

function storage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; }
  catch { return null; }
}
function discard(s: Storage): null {
  try { s.removeItem(LAST_PLAN_STORAGE_KEY); } catch { /* Storage is optional. */ }
  return null;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

interface InputShape {
  type?: string;
  enum?: readonly unknown[];
  pattern?: string;
  maxLength?: number;
  properties?: Record<string, InputShape>;
  required?: readonly string[];
}
/** Check stored input shapes against C3; physical input ranges stay in compute.validatePlanInput. */
function matches(value: unknown, shape: InputShape): boolean {
  if (shape.enum && !shape.enum.includes(value)) return false;
  if (shape.type === "object") {
    if (!record(value) || shape.required?.some(key => value[key] === undefined)) return false;
    return Object.entries(shape.properties ?? {}).every(([key, field]) => value[key] === undefined || matches(value[key], field));
  }
  if (shape.type && typeof value !== shape.type) return false;
  if (typeof value === "number" && !Number.isFinite(value)) return false;
  if (typeof value === "string" && ((shape.pattern && !new RegExp(shape.pattern).test(value)) || (shape.maxLength !== undefined && value.length > shape.maxLength))) return false;
  return true;
}

export function saveLastPlan(plan: PlanExport): void {
  try { storage()?.setItem(LAST_PLAN_STORAGE_KEY, JSON.stringify(plan)); }
  catch { /* Quota or blocked storage must never interrupt the planner. */ }
}

/** Restore compatible inputs only. Stored results are discarded and the worker recomputes. */
export function restoreLastPlan(site: Pick<Site, "site_id" | "data_version">): RestoredPlan | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(LAST_PLAN_STORAGE_KEY);
    if (!raw) return null;
    const plan: unknown = JSON.parse(raw);
    if (!record(plan) || typeof plan.export_schema_version !== "string" ||
      !/^\d+\.\d+\.\d+$/.test(plan.export_schema_version) ||
      plan.export_schema_version.split(".")[0] !== EXPORT_SCHEMA_VERSION.split(".")[0] ||
      plan.site_id !== site.site_id || plan.data_version !== site.data_version ||
      !matches(plan.scenario, schema.$defs.MissionScenario) ||
      !Array.isArray(plan.waypoints) || !plan.waypoints.every(w => matches(w, schema.$defs.Waypoint))) return discard(s);
    const scenario = plan.scenario as MissionScenario;
    const waypoints = plan.waypoints as Waypoint[];
    if (new Set(waypoints.map(w => w.id)).size !== waypoints.length ||
      (scenario.vehicle_available && !scenario.vehicle_param_set?.trim()) ||
      validatePlanInput(scenario, waypoints).length > 0) return discard(s);
    return { scenario, waypoints };
  } catch { return discard(s); }
}
