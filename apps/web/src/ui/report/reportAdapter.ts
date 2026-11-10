/**
 * SCR-17 report adapter (01 FR-46, 03 SCR-17): maps the snake_case PostEvaReport that `GET /api/report` returns onto the
 * camelCase PostEvaReportData the screen renders. Pure: no clock, no network, no computed science. Every number shown comes
 * from the API report; this file only renames, formats and picks (no sums, no invented values).
 *
 * Nothing fetches `/api/report` yet: wiring the screen to the endpoint is a later slice.
 *
 * TODO(decision): `ApiPostEvaReport` mirrors apps/hab-core/src/report.ts because apps/web cannot import the Hab Core. Move
 * the type into packages/protocol (contract change) so both sides share one definition.
 */

import type { AlertCode, AlertLevel } from "@marswalk/protocol";
import { REPORT_DISCLAIMER, type PostEvaReportData } from "../screens/scr17PostEvaReport";

export interface ApiStopCrewTiming {
  crew_id: string;
  arrived_sim_time: string | null;
  departed_sim_time: string | null;
  arrival_offset_s: number | null;
  dwell_s: number | null;
  planned_arrival_offset_s: number | null;
  planned_departure_offset_s: number | null;
  planned_dwell_s: number | null;
  arrival_diff_s: number | null;
  dwell_diff_s: number | null;
}

export interface ApiPostEvaReport {
  session_id: string;
  scenario_id: string;
  data_version: string;
  seed: number;
  generated_at: string;
  log_hash: string;
  eva_duration_s: number | null;
  stops: {
    completed: number;
    dropped: number;
    not_reached: number;
    incomplete: number;
    in_progress: number;
    pending: number;
    details: { stop_id: string; status: "completed" | "in_progress" | "incomplete" | "dropped" | "not_reached" | "pending"; crew: ApiStopCrewTiming[] }[];
  };
  alerts: {
    total: number;
    details: {
      alert_id: string;
      code: AlertCode;
      level: AlertLevel;
      raised_sim_time: string;
      acked_sim_time: string | null;
      cleared_sim_time: string | null;
      ack_s: number | null;
      shelter: { crew_id: string; shelter_response_s: number | null; sheltered_sim_time: string | null }[];
    }[];
  };
  tasks: {
    total: number;
    done: number;
    skipped: number;
    dropped: number;
    per_stop: Record<string, { done: number; skipped: number; dropped: number; total: number }>;
  };
  dose: {
    per_crew: {
      crew_id: string;
      sheltered: boolean;
      sheltered_sim_time: string | null;
      haven_kind: string | null;
      dose_event_ugy: number | null;
      dose_event_unsheltered_ugy: number | null;
    }[];
    headline: { crew_id: string; dose_event_ugy: number; dose_event_unsheltered_ugy: number | null } | null;
    background_dose_ugy: number | null;
  };
  plan_revisions: number;
  disclaimer: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** "13:21:00 UTC" from an ISO sim time (string slicing only); null when it is not an ISO time. */
function clock(iso: string | null): string | null {
  const m = iso === null ? null : /T(\d{2}:\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} UTC` : null;
}

/** "MM:SS" of a duration in seconds; minutes may exceed 59. */
function mmss(totalS: number): string {
  const s = Math.abs(Math.round(totalS));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

const offset = (s: number | null): string | null => (s === null ? null : `T+${mmss(s)}`);
const duration = (s: number | null): string | null => (s === null ? null : mmss(s));
const signed = (s: number | null): string | null => (s === null ? null : `${s < 0 ? "-" : "+"}${mmss(s)}`);

type TimelineRow = NonNullable<PostEvaReportData["timeline"]>[number];

function timelineRows(api: ApiPostEvaReport): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const stop of api.stops.details) {
    // A stop that anyone reached keeps its per-crew timings, also when it was dropped afterwards.
    const reached = stop.crew.some((c) => c.arrived_sim_time !== null);
    if (reached) {
      const suffix = stop.status === "dropped" ? " · DROPPED" : stop.status === "incomplete" ? " · INCOMPLETE" : "";
      for (const c of stop.crew) {
        rows.push({
          stopId: stop.stop_id,
          crewId: c.crew_id,
          status: `${c.departed_sim_time !== null ? "LEFT" : c.arrived_sim_time !== null ? "AT STOP" : "NOT ARRIVED"}${suffix}`,
          plannedArrival: offset(c.planned_arrival_offset_s),
          actualArrival: offset(c.arrival_offset_s),
          arrivalDiff: signed(c.arrival_diff_s),
          plannedDwell: duration(c.planned_dwell_s),
          actualDwell: duration(c.dwell_s),
          dwellDiff: signed(c.dwell_diff_s),
        });
      }
    } else {
      // Dropped, not reached or pending: one row with the status word; the plan's time is the same for every crew.
      const planned = stop.crew[0];
      rows.push({
        stopId: stop.stop_id,
        crewId: null,
        status: stop.status === "dropped" ? "DROPPED" : stop.status === "not_reached" ? "NOT REACHED" : stop.status === "incomplete" ? "INCOMPLETE" : "PENDING",
        plannedArrival: offset(planned?.planned_arrival_offset_s ?? null),
        actualArrival: null,
        arrivalDiff: null,
        plannedDwell: duration(planned?.planned_dwell_s ?? null),
        actualDwell: null,
        dwellDiff: null,
      });
    }
  }
  return rows;
}

/** The text the screen adds after the mandatory disclaimer: the API's own disclaimer when it says something more. */
function commentary(text: string): string | undefined {
  const rest = text.replace(REPORT_DISCLAIMER, "").trim();
  return rest === "" ? undefined : rest;
}

const known = (v: string): string | undefined => (v === "" || v === "unknown" ? undefined : v);

export function adaptPostEvaReport(api: ApiPostEvaReport): PostEvaReportData {
  const out: PostEvaReportData = {
    sessionId: known(api.session_id),
    scenarioId: known(api.scenario_id),
    dataVersion: known(api.data_version),
    seed: api.seed,
    logHash: known(api.log_hash),
    stopsCompleted: api.stops.completed,
    stopsTotal: api.stops.details.length,
    stopsDropped: api.stops.dropped,
    stopsNotReached: api.stops.not_reached,
    stopsIncomplete: api.stops.incomplete,
    stopsInProgress: api.stops.in_progress,
    stopsPending: api.stops.pending,
    planRevisionsCount: api.plan_revisions,
    evaDurationS: api.eva_duration_s,
    generatedAt: clock(api.generated_at) ?? undefined,
    tasksTotals: { total: api.tasks.total, done: api.tasks.done, skipped: api.tasks.skipped, dropped: api.tasks.dropped },
    timeline: timelineRows(api),
    alerts: api.alerts.details.map((a) => ({
      level: a.level,
      code: a.code,
      raisedAt: clock(a.raised_sim_time) ?? a.raised_sim_time,
      ackedAt: clock(a.acked_sim_time),
      clearedAt: clock(a.cleared_sim_time),
      ackSec: a.ack_s,
      shelter: a.shelter.map((s) => ({ crewId: s.crew_id, responseSec: s.shelter_response_s, shelteredAt: clock(s.sheltered_sim_time) })),
    })),
    tasks: Object.entries(api.tasks.per_stop)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) // code-unit order: the same on every host
      .map(([stopName, c]) => ({ stopName, done: c.done, skipped: c.skipped, dropped: c.dropped, total: c.total })),
    doseRows: api.dose.per_crew.map((c) => ({ crewId: c.crew_id, doseReceivedUgy: c.dose_event_ugy, doseUnshelteredUgy: c.dose_event_unsheltered_ugy })),
    disclaimer: commentary(api.disclaimer),
  };

  if (api.dose.headline) {
    out.doseReceivedUgy = api.dose.headline.dose_event_ugy;
    out.doseUnshelteredUgy = api.dose.headline.dose_event_unsheltered_ugy ?? undefined;
    out.doseHeadlineCrew = api.dose.headline.crew_id;
  }

  // TODO(decision): "time to shelter" slab = the slowest crew response over every alert (worst case); confirm with Sadman.
  const responses = api.alerts.details.flatMap((a) => a.shelter.map((s) => s.shelter_response_s)).filter((v): v is number => v !== null);
  if (responses.length > 0) out.timeToShelterMin = Math.round((Math.max(...responses) / 60) * 10) / 10;

  return out;
}
