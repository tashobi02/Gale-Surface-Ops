/**
 * PostEvaReport (01 FR-46, FR-50; 05 PostEvaReport field table, BD-76). The type moved here from
 * apps/hab-core/src/report.ts (which re-exports it) so the web report view and the Hab Core share it.
 * Values are reduced from the session log by the Hab Core; nothing here is computed on a client.
 */
import type { AlertCode, AlertLevel, CrewId } from "./runtime";
import type { Provenance } from "./schema";

/**
 * `pending`: not reached yet and the EVA has not ended; `not_reached`: never reached, not dropped, EVA ended;
 * `incomplete`: reached but not every EVA crew left by EVA_ENDED; `in_progress`: the same while the EVA runs.
 */
export type StopStatus = "completed" | "in_progress" | "incomplete" | "dropped" | "not_reached" | "pending";

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
    incomplete: number;
    /** Reached, not every EVA crew has left, EVA still running. */
    in_progress: number;
    /** Not reached yet, EVA still running. */
    pending: number;
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
    provenance: { per_crew: "simulated"; headline: "derived"; planned_background_ugy: "modelled" };
    /**
     * Background dose received during the EVA, apart from the event: the engine integrates one recorded series (background and
     * event together) into `dose_event_ugy`, so there is no separate figure and this is null. The planned figure is
     * `planned_background_ugy`.
     */
    background_dose_ugy: number | null;
    /**
     * Planned background dose, µGy: the scenario's dose series' own `background_rate` (µGy/h) times the plan's planned EVA hours
     * (`result.totals.eva_total_min`), no shielding factor, via compute `backgroundDoseUgy`; `modelled` (BD-132, which amends
     * BD-76: `estimateDose` gives dose equivalent in mSv and 02 §D.13 forbids converting it to the µGy of this field). Null with
     * `planned_background_reason` when the plan, its totals or the dose series is missing or unusable.
     */
    planned_background_ugy: number | null;
    planned_background_reason: string | null;
    /** The dose series' `source_id` when `planned_background_ugy` is set, else null (FR-15). */
    planned_background_source_id: string | null;
  };
  /**
   * Crew positions decimated to 30 s, `simulated`: sampled from engine state by the session and rebuilt on resume by
   * re-deriving, because the log stores no per-tick positions (05 U-24, BD-76). Filled by work package 20.
   */
  trace: { crew_id: CrewId; points: { sim_time: string; x_m: number; y_m: number }[] }[];
  plan_revisions: number;
  provenance_summary: Record<Provenance, number>;
  disclaimer: string;
}
