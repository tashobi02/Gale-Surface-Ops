/**
 * PostEvaReport builder (01 FR-46, FR-50, 05 PostEvaReport).
 * Implementation: T27.01 (Ridita Alam, R5 EVA & Ops UI); definitions below approved by Sadman Shaharier Mahim, 11 Nov.
 *
 * Every value in the report is reduced from the immutable session log (session.jsonl);
 * nothing is computed from live or wall-clock variables (NFR-06). `generated_at` is the log's last
 * simulation time (empty for an empty log), so identical input always gives identical output.
 *
 * Scope: the events after the last SESSION_LOADED (the current session). Only the kinds read below are data;
 * anything else (CLOCK_JUMPED, SESSION_RESET, EVENT_STARTED, ...) is ignored.
 *
 * Definitions:
 * - Stop timing, per crew member per stop: arrival offset = ARRIVED_STOP - EVA_STARTED; dwell = LEFT_STOP - ARRIVED_STOP.
 *   The planned side is the plan's stops_timeline as offsets from the plan's `eva_start_utc`; null without a plan.
 *   Actual is `simulated`, planned and differences are `derived`. No LEFT_STOP gives a null departure and dwell.
 * - Shelter response, per (alert, crew in subjects): the first CREW_SHELTERED of that crew after the raise while the alert
 *   has not been cleared, minus the raise time; otherwise null. `ack_s` is the first ALERT_ACKED minus the raise time.
 * - Dropped stop: a role "stop" waypoint of the previous plan (initial plan, or the last PLAN_REVISED's waypoints) that the
 *   PLAN_REVISED waypoints no longer have, by stop_id; `stops_dropped` ordinals are never mapped to ids.
 * - Dose: one row per crew member from that crew's last CREW_SHELTERED; the headline is the highest individual
 *   dose_event_ugy; there is no crew total.
 *
 * TODO(decision): the server passes the Hab Core's current plan snapshot, because SessionHandle does not expose the loaded
 * scenario's initial plan. After a PLAN_REVISED the snapshot's waypoints no longer line up with its (original)
 * stops_timeline, so planned timing is null then. Expose the scenario plan through SessionHandle to fix that.
 * TODO(decision): contract change in packages/protocol if PostEvaReport moves there; the type lives in this file for now.
 */

import type {
  AlertCode,
  AlertLevel,
  LogEvent,
  LogEventData,
  PlanExport,
  Provenance,
  Waypoint,
} from "@marswalk/protocol";

/** `pending`: not reached yet and the EVA has not ended; `not_reached`: never reached, not dropped, EVA ended. */
export type StopStatus = "completed" | "in_progress" | "dropped" | "not_reached" | "pending";

/** One crew member at one stop. Offsets are seconds from EVA_STARTED; all of them null when not known. */
export interface StopCrewTiming {
  crew_id: string;
  arrived_sim_time: string | null;
  departed_sim_time: string | null;
  arrival_offset_s: number | null;
  dwell_s: number | null;
  planned_arrival_offset_s: number | null;
  planned_departure_offset_s: number | null;
  planned_dwell_s: number | null;
  /** actual minus planned (positive = later / longer). */
  arrival_diff_s: number | null;
  dwell_diff_s: number | null;
  provenance: { actual: "simulated"; planned: "derived"; differences: "derived" };
}

export interface StopReportDetail {
  stop_id: string;
  stop_index?: number;
  status: StopStatus;
  crew: StopCrewTiming[];
}

export interface AlertShelterResponse {
  crew_id: string;
  /** Null: no shelter during the alert. */
  shelter_response_s: number | null;
  sheltered_sim_time: string | null;
}

export interface AlertReportDetail {
  alert_id: string;
  code: AlertCode;
  level: AlertLevel;
  raised_sim_time: string;
  acked_sim_time: string | null;
  cleared_sim_time: string | null;
  /** First ALERT_ACKED minus ALERT_RAISED. */
  ack_s: number | null;
  shelter: AlertShelterResponse[];
  provenance: { times: "simulated"; durations: "derived" };
}

export interface TaskCounts {
  done: number;
  skipped: number;
  dropped: number;
  total: number;
}

export interface CrewDoseRow {
  crew_id: string;
  sheltered: boolean;
  sheltered_sim_time: string | null;
  haven_kind: string | null;
  /** Null: not sheltered. */
  dose_event_ugy: number | null;
  dose_event_unsheltered_ugy: number | null;
}

export interface PostEvaReport {
  session_id: string;
  scenario_id: string;
  data_version: string;
  seed: number;
  generated_at: string;
  log_hash: string;
  /** Null without both EVA_STARTED and EVA_ENDED. */
  eva_duration_s: number | null;
  stops: {
    completed: number;
    dropped: number;
    not_reached: number;
    details: StopReportDetail[];
  };
  alerts: {
    total: number;
    details: AlertReportDetail[];
  };
  tasks: {
    total: number;
    done: number;
    skipped: number;
    dropped: number;
    per_stop: Record<string, TaskCounts>;
  };
  dose: {
    per_crew: CrewDoseRow[];
    /** The crew member with the highest dose_event_ugy; null when nobody sheltered. Never a crew total. */
    headline: { crew_id: string; dose_event_ugy: number; dose_event_unsheltered_ugy: number | null } | null;
    provenance: { per_crew: "simulated"; headline: "derived" };
    /**
     * Planned-background dose. Unavailable (null) until a sourced planned-background result arrives through the
     * report/session contract: no rate lives in this builder (science lives in packages/compute, AGENTS rule 2).
     * TODO(decision): supply a sourced planned-background dose result through the agreed report/session contract;
     * background dose remains unavailable until then.
     */
    background_dose_ugy: number | null;
  };
  plan_revisions: number;
  provenance_summary: Record<Provenance, number>;
  disclaimer: string;
}

export const REPORT_DISCLAIMER =
  "NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map. " +
  "For simulation and educational demonstration only; not certified for actual Martian flight or surface operations.";

const secondsBetween = (from: string | null, to: string | null): number | null => {
  if (from === null || to === null) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 1000);
};

const diff = (actual: number | null, planned: number | null): number | null => (actual === null || planned === null ? null : actual - planned);

const stopIds = (waypoints: readonly Waypoint[] | undefined): string[] => (waypoints ?? []).filter((w) => w.role === "stop").map((w) => w.id);

interface PlannedStop {
  arrival_offset_s: number;
  departure_offset_s: number;
  dwell_s: number;
}

/** stop_id -> planned timing. Only when stops_timeline lines up with the waypoints one to one (05: per waypoint). */
function plannedTiming(plan: PlanExport | null | undefined): Map<string, PlannedStop> {
  const out = new Map<string, PlannedStop>();
  const timeline = plan?.result?.stops_timeline;
  const waypoints = plan?.waypoints;
  const evaStart = plan?.scenario?.eva_start_utc;
  if (!plan || !Array.isArray(timeline) || !Array.isArray(waypoints) || typeof evaStart !== "string" || timeline.length !== waypoints.length) return out;
  waypoints.forEach((w, i) => {
    if (w.role !== "stop") return;
    const arrive = secondsBetween(evaStart, timeline[i].arrive_utc);
    const depart = secondsBetween(evaStart, timeline[i].depart_utc);
    if (arrive !== null && depart !== null) out.set(w.id, { arrival_offset_s: arrive, departure_offset_s: depart, dwell_s: depart - arrive });
  });
  return out;
}

interface AlertRecord extends AlertReportDetail {
  open: boolean;
}

export function buildReport(allEvents: LogEvent[], logHash: string = "", plan?: PlanExport | null): PostEvaReport {
  // Scope: the current session = everything after the last SESSION_LOADED (that event included).
  let from = 0;
  allEvents.forEach((e, i) => {
    if (e.kind === "SESSION_LOADED") from = i;
  });
  const events = allEvents.slice(from);

  let sessionId = "unknown";
  let scenarioId = "unknown";
  let dataVersion = "unknown";
  let seed = 0;
  let evaStartTime: string | null = null;
  let evaEndTime: string | null = null;
  let evaCrew: string[] = [];

  const alerts: AlertRecord[] = [];
  const latestAlert = new Map<string, AlertRecord>();
  const taskMap = new Map<string, { stop_id: string; state: string }>();
  let planRevisions = 0;

  // Stops: known ids in first-seen order, per-(stop, crew) timings, dropped set.
  const stopOrder: string[] = [];
  const stopIndexOf = new Map<string, number>();
  const noteStop = (id: string): void => {
    if (!stopOrder.includes(id)) stopOrder.push(id);
  };
  const arrivals = new Map<string, Map<string, { arrived: string; left: string | null }>>();
  const dropped = new Set<string>();
  let currentStops: string[] | null = null; // the previous plan's stops, once known
  const initialStops = stopIds(plan?.waypoints);
  initialStops.forEach(noteStop);

  const crewSeen: string[] = [];
  const noteCrew = (id: string): void => {
    if (!crewSeen.includes(id)) crewSeen.push(id);
  };
  const lastShelter = new Map<string, { sim_time: string; data: LogEventData["CREW_SHELTERED"] }>();

  const provenanceSummary: Record<Provenance, number> = {
    measured: 0,
    derived: 0,
    modelled: 0,
    assumed: 0,
    replayed: 0,
    simulated: 0,
  };

  for (const event of events) {
    // Provenance counts
    if (event.provenance) {
      for (const p of Object.values(event.provenance)) {
        if (p in provenanceSummary) {
          provenanceSummary[p as Provenance]++;
        }
      }
    }

    switch (event.kind) {
      case "SESSION_LOADED": {
        const d = event.data as LogEventData["SESSION_LOADED"];
        sessionId = d.session_id;
        scenarioId = d.scenario_id;
        dataVersion = d.data_version;
        seed = d.seed;
        break;
      }

      case "EVA_STARTED": {
        const d = event.data as LogEventData["EVA_STARTED"];
        if (evaStartTime === null) {
          evaStartTime = event.sim_time;
          evaCrew = Array.isArray(d.crew_ids) ? [...d.crew_ids] : [];
          evaCrew.forEach(noteCrew);
        }
        break;
      }

      case "EVA_ENDED": {
        evaEndTime = event.sim_time;
        break;
      }

      case "ARRIVED_STOP": {
        const d = event.data as LogEventData["ARRIVED_STOP"];
        noteStop(d.stop_id);
        noteCrew(d.crew_id);
        if (typeof d.stop_index === "number") stopIndexOf.set(d.stop_id, d.stop_index);
        const perCrew = arrivals.get(d.stop_id) ?? new Map();
        if (!perCrew.has(d.crew_id)) perCrew.set(d.crew_id, { arrived: event.sim_time, left: null });
        arrivals.set(d.stop_id, perCrew);
        break;
      }

      case "LEFT_STOP": {
        const d = event.data as LogEventData["LEFT_STOP"];
        const rec = arrivals.get(d.stop_id)?.get(d.crew_id);
        if (rec && rec.left === null) rec.left = event.sim_time;
        break;
      }

      case "PLAN_REVISED": {
        planRevisions++;
        const d = event.data as LogEventData["PLAN_REVISED"];
        if (Array.isArray(d.waypoints)) {
          // The previous plan's stops: the last revision's, else the initial plan's plus the stops the log already names.
          const previous = currentStops ?? stopOrder.slice();
          const next = stopIds(d.waypoints);
          for (const id of previous) {
            if (!next.includes(id)) dropped.add(id);
          }
          next.forEach(noteStop);
          currentStops = next;
        }
        break;
      }

      case "ALERT_RAISED": {
        const d = event.data as LogEventData["ALERT_RAISED"];
        const record: AlertRecord = {
          alert_id: d.alert_id,
          code: d.code,
          level: d.level,
          raised_sim_time: event.sim_time,
          acked_sim_time: null,
          cleared_sim_time: null,
          ack_s: null,
          shelter: (Array.isArray(d.subjects) ? d.subjects : []).map((c) => ({ crew_id: String(c), shelter_response_s: null, sheltered_sim_time: null })),
          provenance: { times: "simulated", durations: "derived" },
          open: true,
        };
        alerts.push(record);
        latestAlert.set(d.alert_id, record);
        break;
      }

      case "ALERT_ACKED": {
        const d = event.data as LogEventData["ALERT_ACKED"];
        const existing = latestAlert.get(d.alert_id);
        if (existing && existing.acked_sim_time === null) {
          existing.acked_sim_time = event.sim_time;
          const s = secondsBetween(existing.raised_sim_time, event.sim_time);
          existing.ack_s = s === null ? null : Math.max(0, s);
        }
        break;
      }

      case "ALERT_CLEARED": {
        const d = event.data as LogEventData["ALERT_CLEARED"];
        const existing = latestAlert.get(d.alert_id);
        if (existing && existing.open) {
          existing.open = false;
          existing.cleared_sim_time = event.sim_time;
        }
        break;
      }

      case "TASK_ADDED": {
        const d = event.data as LogEventData["TASK_ADDED"];
        noteStop(d.stop_id);
        taskMap.set(d.task_id, {
          stop_id: d.stop_id,
          state: "TODO",
        });
        break;
      }

      case "TASK_UPDATED": {
        const d = event.data as LogEventData["TASK_UPDATED"];
        const existing = taskMap.get(d.task_id);
        if (existing) {
          existing.state = d.state;
        }
        break;
      }

      case "TASK_DROPPED": {
        const d = event.data as LogEventData["TASK_DROPPED"];
        const existing = taskMap.get(d.task_id);
        if (existing) {
          existing.state = "DROPPED";
        }
        break;
      }

      case "CREW_SHELTERED": {
        const d = event.data as LogEventData["CREW_SHELTERED"];
        noteCrew(d.crew_id);
        lastShelter.set(d.crew_id, { sim_time: event.sim_time, data: d });
        // A response only while the alert is still open, and only the first one.
        for (const a of alerts) {
          if (!a.open) continue;
          const row = a.shelter.find((r) => r.crew_id === d.crew_id);
          if (row && row.sheltered_sim_time === null) {
            row.sheltered_sim_time = event.sim_time;
            const s = secondsBetween(a.raised_sim_time, event.sim_time);
            row.shelter_response_s = s === null ? null : Math.max(0, s);
          }
        }
        break;
      }

      default:
        break;
    }
  }

  const crewOrder = evaCrew.length > 0 ? [...evaCrew, ...crewSeen.filter((c) => !evaCrew.includes(c))] : crewSeen;
  const eva = evaCrew.length > 0 ? evaCrew : crewSeen;
  const planned = plannedTiming(plan);
  const evaEnded = evaEndTime !== null;

  const stopDetails: StopReportDetail[] = stopOrder.map((stop_id) => {
    const perCrew = arrivals.get(stop_id);
    const p = planned.get(stop_id);
    const crew: StopCrewTiming[] = crewOrder.map((crew_id) => {
      const rec = perCrew?.get(crew_id);
      const arrival = secondsBetween(evaStartTime, rec?.arrived ?? null);
      const dwell = secondsBetween(rec?.arrived ?? null, rec?.left ?? null);
      return {
        crew_id,
        arrived_sim_time: rec?.arrived ?? null,
        departed_sim_time: rec?.left ?? null,
        arrival_offset_s: arrival,
        dwell_s: dwell,
        planned_arrival_offset_s: p?.arrival_offset_s ?? null,
        planned_departure_offset_s: p?.departure_offset_s ?? null,
        planned_dwell_s: p?.dwell_s ?? null,
        arrival_diff_s: diff(arrival, p?.arrival_offset_s ?? null),
        dwell_diff_s: diff(dwell, p?.dwell_s ?? null),
        provenance: { actual: "simulated", planned: "derived", differences: "derived" },
      };
    });
    const reached = perCrew !== undefined && perCrew.size > 0;
    let status: StopStatus;
    if (reached) {
      const everyoneLeft = eva.length > 0 && eva.every((c) => perCrew.get(c)?.left != null);
      status = everyoneLeft ? "completed" : "in_progress";
    } else if (dropped.has(stop_id)) {
      status = "dropped";
    } else {
      status = evaEnded ? "not_reached" : "pending";
    }
    const detail: StopReportDetail = { stop_id, status, crew };
    const index = stopIndexOf.get(stop_id);
    if (index !== undefined) detail.stop_index = index;
    return detail;
  });

  // Calculate duration
  const durationS = evaStartTime !== null && evaEndTime !== null ? secondsBetween(evaStartTime, evaEndTime) : null;

  const count = (status: StopStatus): number => stopDetails.filter((s) => s.status === status).length;

  // Dose rows: one per crew member, from that member's last CREW_SHELTERED.
  const perCrewDose: CrewDoseRow[] = crewOrder.map((crew_id) => {
    const s = lastShelter.get(crew_id);
    if (!s) return { crew_id, sheltered: false, sheltered_sim_time: null, haven_kind: null, dose_event_ugy: null, dose_event_unsheltered_ugy: null };
    return {
      crew_id,
      sheltered: true,
      sheltered_sim_time: s.sim_time,
      haven_kind: s.data.haven_kind ?? null,
      dose_event_ugy: typeof s.data.dose_event_ugy === "number" ? s.data.dose_event_ugy : null,
      dose_event_unsheltered_ugy: typeof s.data.dose_event_unsheltered_ugy === "number" ? s.data.dose_event_unsheltered_ugy : null,
    };
  });
  let headline: PostEvaReport["dose"]["headline"] = null;
  for (const r of perCrewDose) {
    if (r.dose_event_ugy !== null && (headline === null || r.dose_event_ugy > headline.dose_event_ugy)) {
      headline = { crew_id: r.crew_id, dose_event_ugy: r.dose_event_ugy, dose_event_unsheltered_ugy: r.dose_event_unsheltered_ugy };
    }
  }

  // Tasks summary
  let tasksDone = 0;
  let tasksSkipped = 0;
  let tasksDropped = 0;
  const tasksPerStop: Record<string, TaskCounts> = {};

  for (const t of taskMap.values()) {
    if (!tasksPerStop[t.stop_id]) {
      tasksPerStop[t.stop_id] = { done: 0, skipped: 0, dropped: 0, total: 0 };
    }
    tasksPerStop[t.stop_id].total++;

    if (t.state === "DONE") {
      tasksDone++;
      tasksPerStop[t.stop_id].done++;
    } else if (t.state === "SKIPPED") {
      tasksSkipped++;
      tasksPerStop[t.stop_id].skipped++;
    } else if (t.state === "DROPPED") {
      tasksDropped++;
      tasksPerStop[t.stop_id].dropped++;
    }
  }

  return {
    session_id: sessionId,
    scenario_id: scenarioId,
    data_version: dataVersion,
    seed,
    // The terminal event's simulation time, never the host clock (NFR-06); empty for an empty log.
    generated_at: events.length > 0 ? events[events.length - 1].sim_time : "",
    log_hash: logHash,
    eva_duration_s: durationS,
    stops: {
      completed: count("completed"),
      dropped: count("dropped"),
      not_reached: count("not_reached"),
      details: stopDetails,
    },
    alerts: {
      total: alerts.length,
      details: alerts.map(({ open: _open, ...detail }) => detail),
    },
    tasks: {
      total: taskMap.size,
      done: tasksDone,
      skipped: tasksSkipped,
      dropped: tasksDropped,
      per_stop: tasksPerStop,
    },
    dose: {
      per_crew: perCrewDose,
      headline,
      provenance: { per_crew: "simulated", headline: "derived" },
      background_dose_ugy: null,
    },
    plan_revisions: planRevisions,
    provenance_summary: provenanceSummary,
    disclaimer: REPORT_DISCLAIMER,
  };
}
