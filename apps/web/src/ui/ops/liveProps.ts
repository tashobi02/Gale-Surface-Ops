/**
 * Snapshot -> OpsConsole props (docs/specs/03 SCR-11; 05 Snapshot; 01 FR-15, FR-50; T25.01).
 *
 * Passes the Hab Core's values through and labels them. It computes nothing: counts are tallies of the tasks the server
 * sent, never estimates. N-06 conditions keep their supplied provenance and sources (FD-085).
 * What the snapshot does not carry stays undefined, including the EVA phase.
 */
import type { CrewId, LogEvent, Snapshot } from "@marswalk/protocol";
import type { CrewTaskProgress, OpsConsoleProps, OpsLogLine } from "../screens/scr11OpsConsole";
import { isProvenance, selectNextStop } from "../eva/viewModel";
import { formatSimTime, summarizeEvent } from "./EventLog";
import type { ProvenanceValue } from "./ConditionsPanel";

const CREW_IDS: readonly CrewId[] = ["EV1", "EV2"];

/** Position (1-based) of a stop among the plan's stops; null (shown "—") when there is no plan or it lacks the stop. */
function stopNumber(snapshot: Snapshot, stopId: string): number | null {
  const stops = (snapshot.plan?.waypoints ?? []).filter((w) => w.role === "stop");
  const at = stops.findIndex((w) => w.id === stopId);
  return at === -1 ? null : at + 1;
}

function taskProgressOf(snapshot: Snapshot, crewId: CrewId): CrewTaskProgress | null {
  const mine = (snapshot.tasks ?? []).filter((t) => t.crew_id === null || t.crew_id === crewId);
  const next = selectNextStop(snapshot, crewId);
  const stopNo = next ? stopNumber(snapshot, next.stopId) : null;
  if (mine.length === 0 && stopNo === null) return null;
  return {
    stop: next && stopNo !== null ? { stopId: next.stopId, stopNo, done: next.taskCount.done, total: next.taskCount.total } : null,
    total: { done: mine.filter((t) => t.state === "DONE").length, total: mine.length },
  };
}

/**
 * One strip line for the newest event. Its class is the event's own: the class of the first field path in sorted order
 * (deterministic whatever order the map was built in), else null when the event gives none.
 */
function logLineOf(event: LogEvent): OpsLogLine {
  const prov =
    Object.entries(event.provenance ?? {})
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, value]) => value)
      .find(isProvenance) ?? null;
  return {
    key: String(event.seq),
    text: `#${event.seq} ${formatSimTime(event.sim_time)} ${summarizeEvent(event)}`,
    prov,
    src: `log:${event.seq}`,
  };
}

export type LiveOpsProps = Pick<
  OpsConsoleProps,
  "scenarioName" | "sol" | "ltst" | "planRevision" | "phase" | "crew" | "vehicles" | "alerts" | "taskProgress" | "conditions" | "logLines"
>;

export function selectOpsProps(snapshot: Snapshot | null, events: LogEvent[]): LiveOpsProps {
  const newest = events.length > 0 ? events.reduce((a, b) => (b.seq > a.seq ? b : a)) : null;
  const logLines = newest ? [logLineOf(newest)] : [];
  if (!snapshot) return { logLines };

  const taskProgress: Partial<Record<CrewId, CrewTaskProgress>> = {};
  for (const id of CREW_IDS) {
    const p = taskProgressOf(snapshot, id);
    if (p) taskProgress[id] = p;
  }
  const conditions = snapshot.conditions;
  function value<T extends number | string>(field: keyof Snapshot["conditions"], unit?: string): ProvenanceValue<T> | undefined {
    const v = conditions?.[field];
    const prov = conditions?.provenance?.[field];
    const src = conditions?.source_ids?.[field];
    if ((typeof v !== "number" && typeof v !== "string") || (typeof v === "number" && !Number.isFinite(v)) || v === "" || !isProvenance(prov) || !src) return undefined;
    return { v: v as T, prov, src, ...(unit ? { unit } : {}) };
  }
  const ltst = value<string>("ltst");
  const fields = {
    ltst,
    sunElevationDeg: value<number>("sun_elevation_deg", "°"),
    doseRateBackgroundUgyH: value<number>("dose_rate_background_ugy_h", "µGy/h"),
    doseRateEventUgyH: value<number>("dose_rate_event_ugy_h", "µGy/h"),
  };
  return {
    sol: value<number>("sol"),
    ltst,
    conditions: Object.values(fields).some(Boolean) ? fields : undefined,
    scenarioName: snapshot.session.scenario_id,
    planRevision: { v: snapshot.session.plan_revision, prov: "simulated", src: "snapshot:session.plan_revision" },
    crew: snapshot.crew,
    vehicles: snapshot.vehicles,
    alerts: snapshot.alerts,
    taskProgress,
    logLines,
  };
}
