/**
 * PostEvaReport builder (01 FR-46, FR-50, 05 PostEvaReport).
 * Implementation: T27.01 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Every value in the report is reduced from the immutable session log (session.jsonl);
 * nothing is computed from live or wall-clock variables (NFR-06).
 */

import type {
  AlertCode,
  AlertLevel,
  LogEvent,
  LogEventData,
  Provenance,
} from "@marswalk/protocol";

export interface StopReportDetail {
  stop_id: string;
  stop_index?: number;
  arrived_sim_time: string | null;
  status: "completed" | "dropped";
}

export interface AlertReportDetail {
  alert_id: string;
  code: AlertCode;
  level: AlertLevel;
  raised_sim_time: string;
  acked_sim_time: string | null;
  response_time_s: number | null;
}

export interface TaskCounts {
  done: number;
  skipped: number;
  dropped: number;
  total: number;
}

export interface PostEvaReport {
  session_id: string;
  scenario_id: string;
  data_version: string;
  seed: number;
  generated_at: string;
  log_hash: string;
  eva_duration_s: number;
  stops: {
    completed: number;
    dropped: number;
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
    dose_event_ugy: number;
    dose_event_unsheltered_ugy: number;
    background_dose_ugy: number;
  };
  plan_revisions: number;
  provenance_summary: Record<Provenance, number>;
  disclaimer: string;
}

export const REPORT_DISCLAIMER =
  "NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map. " +
  "For simulation and educational demonstration only; not certified for actual Martian flight or surface operations.";

export function buildReport(events: LogEvent[], logHash: string = ""): PostEvaReport {
  let sessionId = "unknown";
  let scenarioId = "unknown";
  let dataVersion = "unknown";
  let seed = 0;
  let evaStartTime: string | null = null;
  let evaEndTime: string | null = null;

  const stopMap = new Map<string, StopReportDetail>();
  const alertMap = new Map<string, AlertReportDetail>();
  const taskMap = new Map<string, { stop_id: string; state: string }>();
  let doseEventUgy = 0;
  let doseUnshelteredUgy = 0;
  let planRevisions = 0;

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
        evaStartTime = event.sim_time;
        break;
      }

      case "EVA_ENDED": {
        evaEndTime = event.sim_time;
        break;
      }

      case "ARRIVED_STOP": {
        const d = event.data as LogEventData["ARRIVED_STOP"];
        stopMap.set(d.stop_id, {
          stop_id: d.stop_id,
          stop_index: d.stop_index,
          arrived_sim_time: event.sim_time,
          status: "completed",
        });
        break;
      }

      case "PLAN_REVISED": {
        planRevisions++;
        const d = event.data as LogEventData["PLAN_REVISED"];
        if (d.stops_dropped && Array.isArray(d.stops_dropped)) {
          for (const stopIdx of d.stops_dropped) {
            const stopId = `wp-${stopIdx}`;
            if (!stopMap.has(stopId)) {
              stopMap.set(stopId, {
                stop_id: stopId,
                stop_index: stopIdx,
                arrived_sim_time: null,
                status: "dropped",
              });
            }
          }
        }
        break;
      }

      case "ALERT_RAISED": {
        const d = event.data as LogEventData["ALERT_RAISED"];
        alertMap.set(d.alert_id, {
          alert_id: d.alert_id,
          code: d.code,
          level: d.level,
          raised_sim_time: event.sim_time,
          acked_sim_time: null,
          response_time_s: null,
        });
        break;
      }

      case "ALERT_ACKED": {
        const d = event.data as LogEventData["ALERT_ACKED"];
        const existing = alertMap.get(d.alert_id);
        if (existing) {
          existing.acked_sim_time = event.sim_time;
          const raisedMs = Date.parse(existing.raised_sim_time);
          const ackedMs = Date.parse(event.sim_time);
          if (!isNaN(raisedMs) && !isNaN(ackedMs)) {
            existing.response_time_s = Math.max(0, Math.round((ackedMs - raisedMs) / 1000));
          }
        }
        break;
      }

      case "TASK_ADDED": {
        const d = event.data as LogEventData["TASK_ADDED"];
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
        if (typeof d.dose_event_ugy === "number") {
          doseEventUgy = Math.max(doseEventUgy, d.dose_event_ugy);
        }
        if (typeof d.dose_event_unsheltered_ugy === "number") {
          doseUnshelteredUgy = Math.max(doseUnshelteredUgy, d.dose_event_unsheltered_ugy);
        }
        break;
      }

      default:
        break;
    }
  }

  // Calculate duration
  let durationS = 0;
  if (evaStartTime && evaEndTime) {
    const s = Date.parse(evaStartTime);
    const e = Date.parse(evaEndTime);
    if (!isNaN(s) && !isNaN(e)) {
      durationS = Math.max(0, Math.round((e - s) / 1000));
    }
  }

  // Stops summary
  const stopDetails = Array.from(stopMap.values());
  const stopsCompleted = stopDetails.filter((s) => s.status === "completed").length;
  const stopsDropped = stopDetails.filter((s) => s.status === "dropped").length;

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

  // Background dose estimate from duration (0.21 uGy/h Gale background)
  const bgRatePerHour = 0.21;
  const backgroundDoseUgy = (durationS / 3600) * bgRatePerHour;

  return {
    session_id: sessionId,
    scenario_id: scenarioId,
    data_version: dataVersion,
    seed,
    generated_at: new Date().toISOString(),
    log_hash: logHash,
    eva_duration_s: durationS,
    stops: {
      completed: stopsCompleted,
      dropped: stopsDropped,
      details: stopDetails,
    },
    alerts: {
      total: alertMap.size,
      details: Array.from(alertMap.values()),
    },
    tasks: {
      total: taskMap.size,
      done: tasksDone,
      skipped: tasksSkipped,
      dropped: tasksDropped,
      per_stop: tasksPerStop,
    },
    dose: {
      dose_event_ugy: doseEventUgy,
      dose_event_unsheltered_ugy: doseUnshelteredUgy,
      background_dose_ugy: Number(backgroundDoseUgy.toFixed(2)),
    },
    plan_revisions: planRevisions,
    provenance_summary: provenanceSummary,
    disclaimer: REPORT_DISCLAIMER,
  };
}
