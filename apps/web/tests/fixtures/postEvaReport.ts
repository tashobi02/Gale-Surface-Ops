/**
 * A complete, typed PostEvaReport (05 PostEvaReport; protocol `report.ts`) for SCR-17 tests and the `print` check: every
 * field the wire type has, no casts (FD-087). Fixture numbers are test data only, never shown as results.
 */
import type { AlertReportDetail, CrewDoseRow, PostEvaReport, StopReportDetail, StopStatus } from "@marswalk/protocol";

export const REPORT_FIXTURE_DISCLAIMER =
  "NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map. " +
  "For simulation and educational demonstration only; not certified for actual Martian flight or surface operations.";

const iso = (s: number): string => new Date(Date.UTC(2024, 4, 20, 13, 0, 0) + s * 1000).toISOString().replace(".000Z", "Z");
const CREW = ["EV1", "EV2"] as const;

export interface ReportFixtureOptions {
  stops?: number;
  alerts?: number;
  /** Points per crew in the trace. */
  tracePoints?: number;
}

function stop(i: number, count: number): StopReportDetail {
  // The last stop of a long walk is dropped and the one before it not reached; the rest are completed.
  const status: StopStatus = count >= 5 && i === count - 1 ? "dropped" : count >= 6 && i === count - 2 ? "not_reached" : "completed";
  const reached = status === "completed";
  return {
    stop_id: `wp-${i + 1}`,
    stop_index: i + 1,
    status,
    crew: CREW.map((crew_id, k) => ({
      crew_id,
      arrived_sim_time: reached ? iso(300 * i + 30 * k) : null,
      departed_sim_time: reached ? iso(300 * i + 240) : null,
      arrival_offset_s: reached ? 300 * i + 30 * k : null,
      dwell_s: reached ? 210 - 30 * k : null,
      planned_arrival_offset_s: 300 * i,
      planned_departure_offset_s: 300 * i + 200,
      planned_dwell_s: 200,
      arrival_diff_s: reached ? 30 * k : null,
      dwell_diff_s: reached ? 10 - 30 * k : null,
      provenance: { actual: "simulated", planned: "derived", differences: "derived" },
    })),
  };
}

function alert(i: number): AlertReportDetail {
  return {
    alert_id: `a-${i + 1}`,
    code: "RADIATION_ALERT",
    level: i === 0 ? "warning" : "caution",
    raised_sim_time: iso(900 + 100 * i),
    acked_sim_time: iso(930 + 100 * i),
    cleared_sim_time: iso(1500),
    ack_s: 30,
    shelter: CREW.map((crew_id, k) => ({ crew_id, shelter_response_s: k === 1 && i === 0 ? null : 60 + 15 * k + i, sheltered_sim_time: k === 1 && i === 0 ? null : iso(960 + 15 * k + 100 * i) })),
    provenance: { times: "simulated", durations: "derived" },
  };
}

export function populatedReport({ stops = 6, alerts = 3, tracePoints = 120 }: ReportFixtureOptions = {}): PostEvaReport {
  const details = Array.from({ length: stops }, (_, i) => stop(i, stops));
  const count = (s: StopStatus): number => details.filter((d) => d.status === s).length;
  const per_crew: CrewDoseRow[] = CREW.map((crew_id, k) => ({
    crew_id,
    sheltered: true,
    sheltered_sim_time: iso(960 + 15 * k),
    haven_kind: "hab",
    dose_event_ugy: 300 + 50 * k,
    dose_event_unsheltered_ugy: 9000,
  }));
  return {
    session_id: "s-0007",
    scenario_id: "storm-sol4190",
    data_version: "gale_boxwork-2026.11.08",
    seed: 4190,
    generated_at: iso(3600),
    log_hash: "ab".repeat(32),
    eva_duration_s: 3600,
    stops: { completed: count("completed"), dropped: count("dropped"), not_reached: count("not_reached"), incomplete: 0, in_progress: 0, pending: 0, details },
    alerts: { total: alerts, details: Array.from({ length: alerts }, (_, i) => alert(i)) },
    tasks: {
      total: 2 * stops,
      done: stops,
      skipped: 0,
      dropped: stops,
      per_stop: Object.fromEntries(details.map((d) => [d.stop_id, { done: 1, skipped: 0, dropped: 1, total: 2 }])),
    },
    dose: {
      per_crew,
      headline: { crew_id: "EV2", dose_event_ugy: 350, dose_event_unsheltered_ugy: 9000 },
      provenance: { per_crew: "simulated", headline: "derived", planned_background_ugy: "modelled" },
      background_dose_ugy: null,
      planned_background_ugy: 17,
      planned_background_reason: null,
    },
    trace: CREW.map((crew_id, k) => ({
      crew_id,
      points: Array.from({ length: tracePoints }, (_, i) => ({ sim_time: iso(30 * i), x_m: 40 * i + 5 * k, y_m: 300 * Math.sin(i / 15) + 10 * k })),
    })),
    plan_revisions: 2,
    provenance_summary: { measured: 0, derived: 4, modelled: 1, assumed: 0, replayed: 0, simulated: 12 },
    disclaimer: REPORT_FIXTURE_DISCLAIMER,
  };
}
