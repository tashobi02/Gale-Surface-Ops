/**
 * SCR-17 — Post-EVA report (docs/specs/03 §B, SCR-17; docs/specs/04 §E.8; mode PRINT, 04 §B.2).
 * Implementation: T27.03 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Requirements:
 * - FR-46: What happened, what it cost, and how sure we are.
 * - Mode PRINT: Clean white paper (#FFFFFF) with dark ink (#111827), high contrast, 12 mm margins.
 * - Fits within 2 pages at most:
 *     Page 1: 4 stat slabs (dose received vs unsheltered, time to shelter, stops completed, plan revisions),
 *             planned vs actual timeline, alerts and responses with response times, map trace schematic.
 *     Page 2: stop tasks summary (FR-50) with simulated chip, event log table, log_hash, scenario, and disclaimer.
 * - Non-negotiable: Every number carries provenance; mandatory NASA Space Apps disclaimer included.
 * - No sample data: with no report supplied every value reads "—" and only the disclaimer remains. Nothing is
 *   filled in from defaults.
 *
 * The data comes from `adaptPostEvaReport` (../report/reportAdapter.ts) applied to `GET /api/report`. Definitions (approved
 * 11 Nov): stop timing per crew per stop (planned `derived` from the plan, actual `simulated`, differences `derived`); shelter
 * response per alert and crew only while the alert is open; dose per crew (`simulated`) with the highest individual picked
 * as the headline (the pick is `derived`, the values stay `simulated`), no crew total; a crew member who never sheltered reads "not sheltered".
 *
 */

import type { CSSProperties, ReactElement } from "react";
import type { Provenance } from "@marswalk/protocol";
import { PROVENANCE_GLYPHS, UNAVAILABLE, fmtFixed, isFiniteNumber, provAttrs, unavailableOf } from "../components/provenance";
import "./scr17PostEvaReport.css";

export interface PostEvaReportData {
  sessionId?: string;
  scenarioId?: string;
  dataVersion?: string;
  seed?: number;
  logHash?: string;
  /** Headline dose: the highest individual's values (`simulated`; the pick is `derived`), never a crew total. Absent when nobody sheltered. */
  trace?: Array<{ crew_id: string; points: Array<{ sim_time: string; x_m: number; y_m: number }> }>;
  /** Planned background dose over the planned EVA (`modelled`); null with `plannedBackgroundReason` when unavailable. */
  plannedBackgroundUgy?: number | null;
  plannedBackgroundReason?: string | null;
  /** The dose series' own source id when the planned background is set (FR-15); null otherwise. */
  plannedBackgroundSourceId?: string | null;
  /** Count of report values per provenance class (05 PostEvaReport `provenance_summary`). */
  provenanceSummary?: Partial<Record<Provenance, number>>;
  doseReceivedUgy?: number;
  doseUnshelteredUgy?: number;
  doseHeadlineCrew?: string;
  /** One row per crew member (`simulated`); null values read "not sheltered". */
  doseRows?: Array<{ crewId: string; doseReceivedUgy: number | null; doseUnshelteredUgy: number | null }>;
  /** Slowest crew shelter response, minutes (`derived`). */
  timeToShelterMin?: number;
  stopsCompleted?: number;
  stopsTotal?: number;
  planRevisionsCount?: number;
  /** Null without EVA_STARTED and EVA_ENDED. */
  evaDurationS?: number | null;
  stopsDropped?: number;
  stopsNotReached?: number;
  stopsIncomplete?: number;
  stopsInProgress?: number;
  stopsPending?: number;
  /** Sim time of the last event in the report's scope. */
  generatedAt?: string;
  tasksTotals?: { total: number; done: number; skipped: number; dropped: number };
  /** One row per crew per reached stop, or one row (crewId null) with a status word. Times are offsets from EVA start. */
  timeline?: Array<{
    stopId: string;
    crewId: string | null;
    status: string;
    plannedArrival: string | null;
    actualArrival: string | null;
    arrivalDiff: string | null;
    plannedDwell: string | null;
    actualDwell: string | null;
    dwellDiff: string | null;
  }>;
  alerts?: Array<{
    level: "warning" | "caution" | "advisory";
    code: string;
    message?: string;
    raisedAt: string;
    ackedAt: string | null;
    clearedAt?: string | null;
    /** First acknowledgement minus raise. */
    ackSec: number | null;
    /** Per crew in the alert's subjects; null response = no shelter during the alert. */
    shelter: Array<{ crewId: string; responseSec: number | null; shelteredAt: string | null }>;
  }>;
  tasks?: Array<{
    stopName: string;
    done: number;
    skipped: number;
    dropped: number;
    total: number;
  }>;
  logEvents?: Array<{
    seq: number;
    time: string;
    actor: string;
    event: string;
    prov: Provenance;
  }>;
  /** Extra commentary shown after the mandatory disclaimer. It never replaces it. */
  disclaimer?: string;
}

export interface PostEvaReportProps {
  report?: PostEvaReportData;
  onPrint?: () => void;
  onExportLog?: () => void;
  onBack?: () => void;
  className?: string;
}

/** Pages rendered below; the "p. n / N" labels are computed from this, not typed. */
const PAGES = [1, 2] as const;
const pageLabel = (n: number): string => `p. ${n} / ${PAGES.length}`;

/** "MM:SS" of a duration in seconds (minutes may exceed 59). */
const mmss = (totalS: number): string => {
  const s = Math.round(totalS);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Mandatory NASA Space Apps disclaimer (01 §F.1); independent of any report data. */
export const REPORT_DISCLAIMER =
  "NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map. " +
  "For simulation and educational demonstration only; not certified for actual Martian flight or surface operations.";

/**
 * Attributes for a report value. Present: its class and `report:<path>` source. Missing: the field's own class is kept,
 * and the value is flagged `data-unavailable` with an `unavailable:report.<path>` source (never labelled `assumed`).
 */
function reportAttrs(present: boolean, prov: Provenance, path: string, source?: string): ReturnType<typeof provAttrs> {
  return provAttrs(present ? { prov, src: source ?? `report:${path}` } : unavailableOf(prov, `report.${path}`));
}

/** Line style per crew in the trace, in legend order: the first solid, then dashed, then dotted (never colour alone). */
const TRACE_DASH = [undefined, "6 4", "2 3"] as const;
const TRACE_WORD = ["solid", "dashed", "dotted"] as const;


const h2Style: CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#4B5563",
  margin: "8px 0 2px 0",
};

/** Glyph beside a report value: its own class when present, none beside "—". */
const glyphIf = (present: boolean, prov: Provenance): string => (present ? PROVENANCE_GLYPHS[prov] : "");

export function PostEvaReport({
  report,
  onPrint,
  onExportLog,
  onBack,
  className = "",
}: PostEvaReportProps): ReactElement {
  const data: PostEvaReportData = report ?? {};
  const hasReceived = isFiniteNumber(data.doseReceivedUgy);
  const hasUnsheltered = isFiniteNumber(data.doseUnshelteredUgy);
  // Per-crew rows were supplied but nobody has a dose: say so instead of "—".
  const nobodySheltered = !hasReceived && (data.doseRows?.length ?? 0) > 0 && data.doseRows?.every((r) => !isFiniteNumber(r.doseReceivedUgy));
  // The mandatory disclaimer is rendered once; supplied commentary is only what is left after it.
  const commentary = (data.disclaimer ?? "").replace(REPORT_DISCLAIMER, "").trim();
  const hasShelter = isFiniteNumber(data.timeToShelterMin);
  const hasStops = isFiniteNumber(data.stopsCompleted) && isFiniteNumber(data.stopsTotal);
  const hasRevisions = isFiniteNumber(data.planRevisionsCount);
  const hasDuration = isFiniteNumber(data.evaDurationS);
  const hasBreakdown = isFiniteNumber(data.stopsDropped) && isFiniteNumber(data.stopsNotReached) && isFiniteNumber(data.stopsIncomplete) && isFiniteNumber(data.stopsInProgress) && isFiniteNumber(data.stopsPending);
  const hasTaskTotals = data.tasksTotals !== undefined;
  const hasHeadline = typeof data.doseHeadlineCrew === "string" && data.doseHeadlineCrew.length > 0;

  const handlePrint = (): void => {
    if (onPrint) {
      onPrint();
    } else if (typeof window !== "undefined" && window.print) {
      window.print();
    }
  };

  const pageStyle: CSSProperties = {
    backgroundColor: "#FFFFFF",
    color: "#111827",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    padding: "24px 28px",
    maxWidth: "800px",
    margin: "0 auto 32px auto",
    border: "1px solid #D1D5DB",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    boxSizing: "border-box",
    minHeight: "1060px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottom: "2px solid #111827",
    paddingBottom: "8px",
  };

  const slabGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "12px",
  };

  const slabStyle: CSSProperties = {
    backgroundColor: "#F3F4F6",
    border: "1px solid #E5E7EB",
    borderRadius: 0,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minHeight: "80px",
  };

  const tableStyle: CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "12px",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    marginTop: "6px",
  };

  const thStyle: CSSProperties = {
    textAlign: "left",
    borderBottom: "1px solid #111827",
    padding: "4px 8px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#4B5563",
    textTransform: "uppercase",
  };

  const tdStyle: CSSProperties = {
    borderBottom: "1px solid #E5E7EB",
    padding: "6px 8px",
  };

  return (
    <div
      className={`scr17-post-eva-report ${className}`}
      data-surface="report"
      data-mode="print"
      style={{
        backgroundColor: "#E5E7EB",
        minHeight: "100vh",
        padding: "20px 0",
        fontFamily: "var(--font-ui, Inter, sans-serif)",
      }}
    >
      {/* Top action toolbar (hidden when printing) */}
      <div
        className="no-print"
        style={{
          maxWidth: "800px",
          margin: "0 auto 16px auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 8px",
        }}
      >
        <div style={{ display: "flex", gap: "8px" }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                padding: "6px 12px",
                backgroundColor: "#1F2937",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 0,
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "12px",
              }}
            >
              ← BACK
            </button>
          )}
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#1F2937", alignSelf: "center" }}>
            SCR-17 · POST-EVA REPORT
          </span>
        </div>
        <button type="button" data-slot="export-log" onClick={onExportLog} disabled={!onExportLog}>EXPORT LOG JSON</button>
        <button
          type="button"
          onClick={handlePrint}
          style={{
            padding: "8px 16px",
            backgroundColor: "#2563EB",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 0,
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "13px",
          }}
        >
          PRINT REPORT (≤ 2 PAGES)
        </button>
      </div>

      {/* ------------------------------------------------------------- PAGE 1 */}
      <article className="report-page" data-page="1" style={pageStyle}>
        {/* Header */}
        <header style={headerStyle}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "12px",
                fontWeight: 600,
                color: "#4B5563",
                letterSpacing: "0.06em",
              }}
            >
              [ SCR-17 /// POST-EVA REPORT ]
            </div>
            <h1
              style={{
                margin: "4px 0 0 0",
                fontSize: "22px",
                fontWeight: 700,
                color: "#111827",
              }}
            >
              Mission Debrief{data.scenarioId ? ` — ${data.scenarioId}` : ""}
            </h1>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12px",
              fontWeight: 700,
              color: "#4B5563",
            }}
          >
            {pageLabel(1)}
          </span>
        </header>

        {/* 4 Stat Slabs (04 §E.8) */}
        <section aria-label="Key mission statistics" style={slabGridStyle}>
          <div className="report-slab" style={slabStyle}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#4B5563" }}>
              DOSE RECEIVED VS UNSHELTERED
            </span>
            <span
              style={{
                fontSize: "20px",
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              <span {...reportAttrs(hasReceived, "simulated", "dose_event_ugy")}>
                {hasReceived ? `${fmtFixed(data.doseReceivedUgy, 1)} µGy` : nobodySheltered ? "not sheltered" : `${UNAVAILABLE} µGy`}{" "}
                {glyphIf(hasReceived, "simulated")}
              </span>
              <span style={{ fontSize: "12px", color: "#4B5563", margin: "0 4px" }}>vs</span>
              <span {...reportAttrs(hasUnsheltered, "simulated", "dose_event_unsheltered_ugy")} style={{ color: "#4B5563" }}>
                {hasUnsheltered ? `${(data.doseUnshelteredUgy as number).toLocaleString("en-US")} µGy` : nobodySheltered ? "not sheltered" : `${UNAVAILABLE} µGy`}{" "}
                {glyphIf(hasUnsheltered, "simulated")}
              </span>
            </span>
            <span style={{ fontSize: "12px", color: "#4B5563" }} {...reportAttrs(hasHeadline, "derived", "dose.headline")}>
              {`highest individual: ${hasHeadline ? data.doseHeadlineCrew : UNAVAILABLE}`} {glyphIf(hasHeadline, "derived")}
            </span>
            <span style={{ fontSize: "12px" }}>
              Planned background:{" "}
              <span {...reportAttrs(isFiniteNumber(data.plannedBackgroundUgy), "modelled", "dose.planned_background_ugy", data.plannedBackgroundSourceId ?? undefined)}>
                {isFiniteNumber(data.plannedBackgroundUgy) ? `${fmtFixed(data.plannedBackgroundUgy, 1)} µGy` : UNAVAILABLE} {glyphIf(isFiniteNumber(data.plannedBackgroundUgy), "modelled")}
              </span>
              {!isFiniteNumber(data.plannedBackgroundUgy) && data.plannedBackgroundReason ? ` (${data.plannedBackgroundReason})` : ""}
            </span>
            {(data.doseRows ?? []).length > 0 && (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: "12px", fontFamily: "var(--font-mono, monospace)" }}>
                {data.doseRows?.map((r) => {
                  const has = isFiniteNumber(r.doseReceivedUgy);
                  return (
                    <li key={r.crewId} {...reportAttrs(has, "simulated", `dose.${r.crewId}`)}>
                      {r.crewId} {has ? `${fmtFixed(r.doseReceivedUgy, 1)} µGy` : "not sheltered"} {glyphIf(has, "simulated")}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="report-slab" style={slabStyle}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#4B5563" }}>
              TIME TO SHELTER
            </span>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
              {...reportAttrs(hasShelter, "derived", "time_to_shelter_min")}
            >
              {hasShelter ? data.timeToShelterMin : UNAVAILABLE} min {glyphIf(hasShelter, "derived")}
            </span>
          </div>

          <div className="report-slab" style={slabStyle}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#4B5563" }}>
              STOPS COMPLETED
            </span>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
              {...reportAttrs(hasStops, "simulated", "stops")}
            >
              {hasStops ? `${data.stopsCompleted} / ${data.stopsTotal}` : UNAVAILABLE} {glyphIf(hasStops, "simulated")}
            </span>
          </div>

          <div className="report-slab" style={slabStyle}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#4B5563" }}>
              PLAN REVISIONS
            </span>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
              {...reportAttrs(hasRevisions, "derived", "plan_revisions")}
            >
              {hasRevisions ? data.planRevisionsCount : UNAVAILABLE} {glyphIf(hasRevisions, "derived")}
            </span>
          </div>
        </section>

        {/* EVA summary: duration and how the stops ended */}
        <section aria-label="EVA summary" style={{ display: "flex", gap: "24px", fontSize: "12px", color: "#4B5563", flexWrap: "wrap" }}>
          <span>
            <span style={{ fontWeight: 700 }}>EVA DURATION </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)" }} {...reportAttrs(hasDuration, "derived", "eva_duration_s")}>
              {hasDuration ? mmss(data.evaDurationS as number) : UNAVAILABLE} {glyphIf(hasDuration, "derived")}
            </span>
          </span>
          <span>
            <span style={{ fontWeight: 700 }}>STOPS </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)" }} {...reportAttrs(hasBreakdown, "derived", "stops_breakdown")}>
              {hasBreakdown
                ? `dropped ${data.stopsDropped} · not reached ${data.stopsNotReached} · incomplete ${data.stopsIncomplete} · in progress ${data.stopsInProgress} · pending ${data.stopsPending}`
                : UNAVAILABLE}{" "}
              {glyphIf(hasBreakdown, "derived")}
            </span>
          </span>
        </section>

        {/* Planned vs Actual Timeline */}
        <section aria-label="Planned vs Actual Timeline">
          <h2
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#4B5563",
              margin: "8px 0 2px 0",
            }}
          >
            [ TIMELINE /// PLANNED VS ACTUAL ]
          </h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Stop</th>
                <th style={thStyle}>Crew</th>
                <th style={thStyle}>Arrive plan / actual / Δ</th>
                <th style={thStyle}>Dwell plan / actual / Δ</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data.timeline ?? []).length === 0 && (
                <tr>
                  <td style={tdStyle} {...reportAttrs(false, "simulated", "timeline")} colSpan={5}>
                    {UNAVAILABLE}
                  </td>
                </tr>
              )}
              {data.timeline?.map((row, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{row.stopId}</td>
                  <td style={tdStyle}>{row.crewId ?? UNAVAILABLE}</td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <span {...reportAttrs(row.plannedArrival !== null, "derived", "timeline.arrival_planned")}>{row.plannedArrival ?? UNAVAILABLE}</span>
                    {" / "}
                    <span {...reportAttrs(row.actualArrival !== null, "simulated", "timeline.arrival_actual")}>{row.actualArrival ?? UNAVAILABLE}</span>
                    {" / "}
                    <span {...reportAttrs(row.arrivalDiff !== null, "derived", "timeline.arrival_diff")}>{row.arrivalDiff ?? UNAVAILABLE}</span>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <span {...reportAttrs(row.plannedDwell !== null, "derived", "timeline.dwell_planned")}>{row.plannedDwell ?? UNAVAILABLE}</span>
                    {" / "}
                    <span {...reportAttrs(row.actualDwell !== null, "simulated", "timeline.dwell_actual")}>{row.actualDwell ?? UNAVAILABLE}</span>
                    {" / "}
                    <span {...reportAttrs(row.dwellDiff !== null, "derived", "timeline.dwell_diff")}>{row.dwellDiff ?? UNAVAILABLE}</span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: row.status === "DROPPED" ? 700 : 400 }}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="report-note" style={{ fontSize: "12px", color: "#4B5563", margin: "4px 0" }}>
            Times are offsets from EVA start (sim time). Planned and differences are derived; actual is simulated.
          </p>
        </section>

        {/* Alerts and Responses */}
        <section aria-label="Alerts and Responses">
          <h2
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#4B5563",
              margin: "8px 0 2px 0",
            }}
          >
            [ SAFETY /// ALERTS AND RESPONSES ]
          </h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Level</th>
                <th style={thStyle}>Alert</th>
                <th style={thStyle}>Raised → Acked (sim UTC)</th>
                <th style={thStyle}>Shelter response per crew</th>
              </tr>
            </thead>
            <tbody>
              {(data.alerts ?? []).length === 0 && (
                <tr>
                  <td style={tdStyle} {...reportAttrs(false, "simulated", "alerts")} colSpan={4}>
                    {UNAVAILABLE}
                  </td>
                </tr>
              )}
              {data.alerts?.map((alt, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>
                    <span
                      style={{
                        padding: "2px 6px",
                        backgroundColor: alt.level === "warning" ? "#FEE2E2" : "#FEF3C7",
                        color: alt.level === "warning" ? "#991B1B" : "#92400E",
                        borderRadius: 0,
                        fontWeight: 700,
                        fontSize: "12px",
                      }}
                    >
                      {alt.level === "warning" ? "⬣" : alt.level === "caution" ? "▲" : "◆"} {alt.level.toUpperCase()}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{alt.code}</div>
                    {alt.message ? <div style={{ fontSize: "12px", color: "#4B5563" }}>{alt.message}</div> : null}
                  </td>
                  <td style={tdStyle}>
                    <span {...reportAttrs(true, "simulated", "alerts.times")}>
                      {alt.raisedAt} → {alt.ackedAt ?? UNAVAILABLE}
                    </span>{" "}
                    <span {...reportAttrs(typeof alt.clearedAt === "string", "simulated", "alerts.cleared")}>
                      {`cleared ${alt.clearedAt ?? UNAVAILABLE}`}
                    </span>{" "}
                    <span {...reportAttrs(isFiniteNumber(alt.ackSec), "derived", "alerts.ack_s")}>
                      {`(ack ${isFiniteNumber(alt.ackSec) ? alt.ackSec : UNAVAILABLE} s)`}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {alt.shelter.length === 0 && <span {...reportAttrs(false, "derived", "alerts.shelter_response_s")}>{UNAVAILABLE}</span>}
                    {alt.shelter.map((r) => {
                      const has = isFiniteNumber(r.responseSec);
                      return (
                        <div key={r.crewId} {...reportAttrs(has, "derived", `alerts.shelter_response_s.${r.crewId}`)}>
                          {r.crewId} {has ? `${r.responseSec} s` : "no shelter during alert"}
                        </div>
                      );
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-label="Map Trace" className="report-block">
          <h2 style={h2Style}>[ MAP /// CREW TRACE ]</h2>
          {(() => {
            const rows = (data.trace ?? []).filter((row) => row.points.length > 0);
            if (rows.length === 0) {
              return (
                <p className="report-note" style={{ fontSize: "12px", margin: "4px 0" }} {...reportAttrs(false, "simulated", "trace")}>
                  {UNAVAILABLE} Trace not available.
                </p>
              );
            }
            const points = rows.flatMap((row) => row.points);
            const minX = Math.min(...points.map((p) => p.x_m));
            const maxX = Math.max(...points.map((p) => p.x_m));
            const minY = Math.min(...points.map((p) => p.y_m));
            const maxY = Math.max(...points.map((p) => p.y_m));
            const w = Math.max(maxX - minX, 1);
            const h = Math.max(maxY - minY, 1);
            return (
              <>
                <svg
                  className="report-trace-svg"
                  data-slot="report-trace"
                  {...reportAttrs(true, "simulated", "trace")}
                  role="img"
                  aria-label={`Crew position traces: ${rows.map((row, k) => `${row.crew_id} ${TRACE_WORD[k] ?? "dotted"}`).join(", ")}`}
                  viewBox={`${minX} ${-maxY} ${w} ${h}`}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ width: "100%", height: "96px", overflow: "visible", color: "#111827" }}
                >
                  {rows.map((row, k) =>
                    row.points.length === 1 ? (
                      <circle key={row.crew_id} data-crew={row.crew_id} cx={row.points[0]!.x_m} cy={-row.points[0]!.y_m} r={Math.max(w, h) * 0.02} fill="currentColor" />
                    ) : (
                      <polyline
                        key={row.crew_id}
                        data-crew={row.crew_id}
                        points={row.points.map((p) => `${p.x_m},${-p.y_m}`).join(" ")}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeDasharray={TRACE_DASH[k] ?? TRACE_DASH[2]}
                        vectorEffect="non-scaling-stroke"
                      />
                    ),
                  )}
                </svg>
                <p className="report-note" style={{ fontSize: "12px", color: "#4B5563", margin: "2px 0" }}>
                  {rows.map((row, k) => `${row.crew_id} ${TRACE_WORD[k] ?? "dotted"}`).join(" / ")} · positions every 30 s, projected metres
                  (local equirectangular), north up · extent{" "}
                  <span {...reportAttrs(true, "derived", "trace.extent")}>
                    {`${Math.round(maxX - minX)} m × ${Math.round(maxY - minY)} m`}
                  </span>{" "}
                  {glyphIf(true, "derived")}
                </p>
              </>
            );
          })()}
        </section>
      </article>

      {/* ------------------------------------------------------------- PAGE 2 */}
      <article className="report-page" data-page="2" style={pageStyle}>
        {/* Header */}
        <header style={headerStyle}>
          <div>
            <div
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "12px",
                fontWeight: 600,
                color: "#4B5563",
                letterSpacing: "0.06em",
              }}
            >
              [ SCR-17 /// EVENT LOG AND SOURCES ]
            </div>
            <h1
              style={{
                margin: "4px 0 0 0",
                fontSize: "22px",
                fontWeight: 700,
                color: "#111827",
              }}
            >
              Stop Tasks and Verification Log
            </h1>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12px",
              fontWeight: 700,
              color: "#4B5563",
            }}
          >
            {pageLabel(2)}
          </span>
        </header>

        {/* Stop Tasks Table (FR-50) */}
        <section aria-label="Stop Tasks Summary">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2
              style={{
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#4B5563",
                margin: "4px 0",
              }}
            >
              [ TASKS /// STOP TASKS — DONE / SKIPPED / DROPPED (FR-50) ]
            </h2>
            <span
              data-provenance="simulated"
              data-source="report:tasks.per_stop"
              style={{
                fontSize: "12px",
                color: "#4B5563",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              ◇ simulated
            </span>
          </div>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Stop</th>
                <th style={thStyle}>Done / Skipped / Dropped</th>
                <th style={thStyle}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(data.tasks ?? []).length === 0 && (
                <tr>
                  <td style={tdStyle} {...reportAttrs(false, "simulated", "tasks")} colSpan={3}>
                    {UNAVAILABLE}
                  </td>
                </tr>
              )}
              {data.tasks?.map((t, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{t.stopName}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono, monospace)" }} {...reportAttrs(true, "simulated", "tasks.counts")}>
                    {`${t.done} / ${t.skipped} / ${t.dropped}`}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono, monospace)" }} {...reportAttrs(true, "simulated", "tasks.total")}>
                    {t.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: "12px", margin: "4px 0", fontFamily: "var(--font-mono, monospace)" }} {...reportAttrs(hasTaskTotals, "simulated", "tasks_totals")}>
            {hasTaskTotals
              ? `All stops: ${data.tasksTotals?.done} / ${data.tasksTotals?.skipped} / ${data.tasksTotals?.dropped} of ${data.tasksTotals?.total}`
              : `All stops: ${UNAVAILABLE}`}
          </p>
          <p style={{ fontSize: "12px", color: "#4B5563", margin: "4px 0 8px 0" }}>
            Dropped tasks: open tasks closed by the system when a plan revision dropped their stop (FR-50).
          </p>
        </section>

        {/* Event Log Table */}
        <section aria-label="Event Log">
          <h2
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#4B5563",
              margin: "6px 0 2px 0",
            }}
          >
            [ AUDIT /// IMMUTABLE EVENT LOG (session.jsonl) ]
          </h2>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: "40px" }}>Seq</th>
                <th style={{ ...thStyle, width: "80px" }}>LTST</th>
                <th style={{ ...thStyle, width: "70px" }}>Actor</th>
                <th style={thStyle}>Event</th>
                <th style={{ ...thStyle, width: "80px" }}>Prov</th>
              </tr>
            </thead>
            <tbody>
              {(data.logEvents ?? []).length === 0 && (
                <tr>
                  <td style={tdStyle} {...reportAttrs(false, "simulated", "log_events")} colSpan={5}>
                    {UNAVAILABLE} The report does not carry the event log. EXPORT LOG JSON downloads the full event log (session.jsonl
                    as JSON); the log hash below covers it.
                  </td>
                </tr>
              )}
              {data.logEvents?.map((evt) => (
                <tr key={evt.seq}>
                  {/* Each readout carries the event's own class and source; the chip beside them is only a name */}
                  <td style={tdStyle} {...reportAttrs(true, evt.prov, `log_events.${evt.seq}.seq`)}>{evt.seq}</td>
                  <td style={tdStyle} {...reportAttrs(true, evt.prov, `log_events.${evt.seq}.time`)}>{evt.time}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }} {...reportAttrs(true, evt.prov, `log_events.${evt.seq}.actor`)}>
                    {evt.actor}
                  </td>
                  <td style={tdStyle} {...reportAttrs(true, evt.prov, `log_events.${evt.seq}.event`)}>{evt.event}</td>
                  <td style={tdStyle}>
                    <span {...reportAttrs(true, evt.prov, `log_events.${evt.seq}`)}>
                      {evt.prov} {PROVENANCE_GLYPHS[evt.prov]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Sources (03 SCR-17, FD-053) */}
        <section aria-label="Sources" className="report-block">
          <h2 style={h2Style}>[ SOURCES /// WHERE THE VALUES COME FROM ]</h2>
          <p className="report-note" style={{ fontSize: "12px", margin: "4px 0" }}>
            Source ids:{" "}
            <span {...reportAttrs(false, "derived", "source_ids")}>{UNAVAILABLE}</span> — the report does not list source ids yet;
            every dataset and method is listed in Sources and methods (SCR-09, <a href="#/sources">#/sources</a>).
          </p>
          <p className="report-note" style={{ fontSize: "12px", margin: "4px 0", fontFamily: "var(--font-mono, monospace)" }}>
            Values by provenance:{" "}
            {data.provenanceSummary && Object.keys(data.provenanceSummary).length > 0 ? (
              <span {...reportAttrs(true, "derived", "provenance_summary")}>
                {(Object.entries(data.provenanceSummary) as Array<[Provenance, number]>)
                  .filter(([, n]) => isFiniteNumber(n) && n > 0)
                  .map(([prov, n]) => `${PROVENANCE_GLYPHS[prov]} ${prov} ${n}`)
                  .join(" · ")}
              </span>
            ) : (
              <span {...reportAttrs(false, "derived", "provenance_summary")}>{UNAVAILABLE}</span>
            )}
          </p>
        </section>

        {/* Verification and Audit Metadata */}
        <footer
          style={{
            marginTop: "auto",
            borderTop: "1px solid #D1D5DB",
            paddingTop: "10px",
            fontSize: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            color: "#4B5563",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "4px" }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase" }}>LOG HASH</span>
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                wordBreak: "break-all",
                color: "#111827",
              }}
            >
              <span {...reportAttrs(typeof data.logHash === "string" && data.logHash.length > 0, "derived", "log_hash")}>
                {data.logHash ? data.logHash : UNAVAILABLE}
              </span>
            </span>

            <span style={{ fontWeight: 700, textTransform: "uppercase" }}>GENERATED</span>
            <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
              <span {...reportAttrs(typeof data.generatedAt === "string" && data.generatedAt.length > 0, "simulated", "generated_at")}>
                {data.generatedAt ? data.generatedAt : UNAVAILABLE}
              </span>{" "}
              (sim time of the last logged event)
            </span>

            <span style={{ fontWeight: 700, textTransform: "uppercase" }}>SCENARIO</span>
            <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
              <span {...reportAttrs(typeof data.scenarioId === "string", "simulated", "scenario_id")}>
                {data.scenarioId ?? UNAVAILABLE}
              </span>{" "}
              · seed{" "}
              <span {...reportAttrs(isFiniteNumber(data.seed), "simulated", "seed")}>
                {isFiniteNumber(data.seed) ? data.seed : UNAVAILABLE}
              </span>{" "}
              · <span {...reportAttrs(typeof data.dataVersion === "string", "simulated", "data_version")}>
                {data.dataVersion ?? UNAVAILABLE}
              </span>
            </span>
          </div>

          <p
            style={{
              fontSize: "12px",
              color: "#4B5563",
              margin: "6px 0 0 0",
              lineHeight: 1.4,
              borderTop: "1px solid #E5E7EB",
              paddingTop: "6px",
            }}
          >
            {REPORT_DISCLAIMER}
            {commentary ? ` ${commentary}` : ""}
          </p>
        </footer>
      </article>
    </div>
  );
}
