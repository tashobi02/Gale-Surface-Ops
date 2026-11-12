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
 *   The planned side is the INITIAL plan's stops_timeline (05: per waypoint, so by index against that plan's waypoints) as
 *   offsets from its `eva_start_utc`; null without a plan or for a stop it has no entry for. A PLAN_REVISED that carries a
 *   whole `plan` (a publish) replaces the planned source for the stops in it. Rows exist only for the crew in EVA_STARTED.
 *   Actual is `simulated`, planned and differences are `derived`. No LEFT_STOP gives a null departure and dwell.
 * - Shelter response, per (alert, crew in subjects): the first CREW_SHELTERED of that crew after the raise while the alert
 *   has not been cleared, minus the raise time; otherwise null. `ack_s` is the first ALERT_ACKED minus the raise time.
 * - Dropped stop: a role "stop" waypoint of the previous plan (initial plan, or the last PLAN_REVISED's waypoints) that the
 *   PLAN_REVISED waypoints no longer have, by stop_id; `stops_dropped` ordinals are never mapped to ids. Only PLAN_REVISED
 *   events after EVA_STARTED are revisions (counted, diffed); one before it is a published plan: it replaces the baseline and
 *   is neither counted nor diffed (confirmed by Sadman Shaharier Mahim, 11 Nov). A stop that was
 *   reached and then dropped is `dropped` with its timings kept.
 * - Stop status: `completed` = every EVA crew has LEFT_STOP; after EVA_ENDED, reached but not all left = `incomplete`, never
 *   reached = `not_reached`; while the EVA runs they are `in_progress` and `pending`.
 * - Dose: one row per crew member from that crew's last CREW_SHELTERED; the headline is the highest individual
 *   dose_event_ugy; there is no crew total.
 *
 * The PostEvaReport types live in packages/protocol/src/report.ts since backend package 01a (BD-76); this file re-exports them.
 */

import { backgroundDoseUgy } from "@marswalk/compute";
import type {
  AlertCode,
  AlertLevel,
  AlertReportDetail,
  AlertShelterResponse,
  CrewDoseRow,
  CrewId,
  DoseSeries,
  LogEvent,
  LogEventData,
  PlanExport,
  PostEvaReport,
  Provenance,
  StopCrewTiming,
  StopReportDetail,
  StopStatus,
  TaskCounts,
  Waypoint,
} from "@marswalk/protocol";

export type { AlertReportDetail, AlertShelterResponse, CrewDoseRow, PostEvaReport, StopCrewTiming, StopReportDetail, StopStatus, TaskCounts };

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

/** Add a plan's per-stop planned timing to `into` (by index: stops_timeline[i] belongs to waypoints[i]); later plans override. */
function addPlanned(into: Map<string, PlannedStop>, plan: PlanExport | null | undefined): void {
  const timeline = plan?.result?.stops_timeline;
  const waypoints = plan?.waypoints;
  const evaStart = plan?.scenario?.eva_start_utc;
  if (!Array.isArray(timeline) || !Array.isArray(waypoints) || typeof evaStart !== "string") return;
  waypoints.forEach((w, i) => {
    const slot = timeline[i];
    if (w.role !== "stop" || !slot) return;
    const arrive = secondsBetween(evaStart, slot.arrive_utc);
    const depart = secondsBetween(evaStart, slot.depart_utc);
    if (arrive !== null && depart !== null) into.set(w.id, { arrival_offset_s: arrive, departure_offset_s: depart, dwell_s: depart - arrive });
  });
}

/** Every CrewId (runtime copy of the protocol type; the compiler checks each entry is one). */
const CREW_IDS: readonly CrewId[] = ["EV1", "EV2"];

interface AlertRecord extends AlertReportDetail {
  open: boolean;
}

/** What the log does not hold: the scenario's dose series, and the crew trace the session samples (BD-76, BD-132). */
export interface ReportExtras {
  /** The scenario's dose series (`SessionHandle.reportInputs().dose`); null or absent: no planned background dose. */
  dose?: DoseSeries | null;
  /** Crew positions every 30 sim-s (`SessionHandle.reportInputs().trace`); absent: an empty trace. */
  trace?: PostEvaReport["trace"];
}

/** Planned background dose over the plan's EVA hours, or why there is none (BD-132). Compute does the arithmetic. */
function plannedBackground(plan: PlanExport | null | undefined, dose: DoseSeries | null | undefined): { ugy: number | null; reason: string | null; source_id: string | null } {
  const none = (reason: string): { ugy: null; reason: string; source_id: null } => ({ ugy: null, reason, source_id: null });
  if (!plan) return none("no plan is in force, so there is no planned EVA duration");
  const totals = plan.result?.totals;
  if (!totals) return none("the plan has no totals (a partial route), so there is no planned EVA duration");
  if (!dose) return none("the scenario has no dose series, so there is no background rate");
  try {
    return { ugy: backgroundDoseUgy(dose, totals.eva_total_min * 60), reason: null, source_id: dose.source_id };
  } catch (err) {
    if (err instanceof RangeError) return none(err.message);
    throw err;
  }
}

/** `plan` is the scenario's initial plan (SessionHandle.initialPlan), never the engine's revised current plan. */
export function buildReport(allEvents: LogEvent[], logHash: string = "", plan?: PlanExport | null, extras: ReportExtras = {}): PostEvaReport {
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
  const initialStops = stopIds(plan?.waypoints);
  // The previous plan's stops: the initial plan's, then each revision's. Without a plan: the stops the log names so far.
  let currentStops: string[] | null = plan ? initialStops : null;
  initialStops.forEach(noteStop);
  const planned = new Map<string, PlannedStop>();
  addPlanned(planned, plan);
  // The plan the planned duration comes from: the initial one, or the last whole plan published before the EVA.
  let plannedPlan: PlanExport | null | undefined = plan;

  const arrivalCrew: string[] = []; // crew seen at a stop
  const shelterCrew: string[] = []; // crew seen in CREW_SHELTERED
  const noteIn = (list: string[], id: string): void => {
    if (!list.includes(id)) list.push(id);
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
        noteIn(arrivalCrew, d.crew_id);
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
        const d = event.data as LogEventData["PLAN_REVISED"];
        // A whole published plan (only possible before the EVA) becomes the planned source for the stops in it.
        if (d.plan) {
          planned.clear(); // the published plan replaces the planned source; a stop it no longer has keeps nothing
          addPlanned(planned, d.plan);
          plannedPlan = d.plan;
        }
        const next = Array.isArray(d.waypoints) ? stopIds(d.waypoints) : null;
        if (evaStartTime === null) {
          // Before the EVA a PLAN_REVISED is a publish: it replaces the baseline, and is neither counted nor diffed.
          if (next) {
            currentStops = next;
            stopOrder.length = 0;
            next.forEach(noteStop);
          }
          break;
        }
        planRevisions++;
        if (next) {
          const previous = currentStops ?? stopOrder.slice();
          for (const id of previous) {
            if (!next.includes(id)) dropped.add(id);
          }
          for (const id of next) dropped.delete(id); // a revision that puts a stop back
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
          // Rows for the subjects on the EVA (a vehicle or a crew member off the EVA cannot "shelter during the alert").
          shelter: (Array.isArray(d.subjects) ? d.subjects : [])
            // Before EVA_STARTED the EVA crew is not known yet: then only crew ids, not vehicles or nodes.
            .filter((c) => (evaCrew.length > 0 ? evaCrew.includes(c) : (CREW_IDS as readonly string[]).includes(c)))
            .map((c) => ({ crew_id: String(c), shelter_response_s: null, sheltered_sim_time: null })),
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
        noteIn(shelterCrew, d.crew_id);
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

  // Stop timing: the crew on the EVA. Dose: those plus anyone else who sheltered.
  const eva = evaCrew.length > 0 ? evaCrew : arrivalCrew;
  const doseCrew = [...eva, ...shelterCrew.filter((c) => !eva.includes(c))];
  const evaEnded = evaEndTime !== null;

  const stopDetails: StopReportDetail[] = stopOrder.map((stop_id) => {
    const perCrew = arrivals.get(stop_id);
    const p = planned.get(stop_id);
    const crew: StopCrewTiming[] = eva.map((crew_id) => {
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
    const reached = perCrew !== undefined && eva.some((c) => perCrew.has(c));
    let status: StopStatus;
    if (dropped.has(stop_id)) {
      status = "dropped"; // also when reached first: the timings above stay
    } else if (reached) {
      const everyoneLeft = eva.every((c) => perCrew.get(c)?.left != null);
      status = everyoneLeft ? "completed" : evaEnded ? "incomplete" : "in_progress";
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
  const perCrewDose: CrewDoseRow[] = doseCrew.map((crew_id) => {
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

  const background = plannedBackground(plannedPlan, extras.dose);
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
      incomplete: count("incomplete"),
      in_progress: count("in_progress"),
      pending: count("pending"),
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
      provenance: { per_crew: "simulated", headline: "derived", planned_background_ugy: "modelled" },
      background_dose_ugy: null,
      planned_background_ugy: background.ugy,
      planned_background_reason: background.reason,
      planned_background_source_id: background.source_id,
    },
    trace: (extras.trace ?? []).map((t) => ({ crew_id: t.crew_id, points: t.points.map((p) => ({ ...p })) })),
    plan_revisions: planRevisions,
    provenance_summary: provenanceSummary,
    disclaimer: REPORT_DISCLAIMER,
  };
}
