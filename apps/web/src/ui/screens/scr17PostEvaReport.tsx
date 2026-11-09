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
 * TODO(decision): agree the report API-to-UI adapter, planned/actual stop timing context, shelter-response association,
 * dropped-stop identity mapping and per-crew versus aggregate dose presentation before completing report integration.
 * TODO(decision): complete real report trace, sources and Export log JSON integration, then verify Chrome A4/Letter
 * pagination with 12 mm margins; article-container counts do not prove two printed pages.
 */

import type { CSSProperties, ReactElement } from "react";
import type { Provenance } from "@marswalk/protocol";
import { PROVENANCE_GLYPHS, UNAVAILABLE, fmtFixed, isFiniteNumber, provAttrs, unavailableOf } from "../components/provenance";

export interface PostEvaReportData {
  sessionId?: string;
  scenarioId?: string;
  dataVersion?: string;
  seed?: number;
  logHash?: string;
  doseReceivedUgy?: number;
  doseUnshelteredUgy?: number;
  timeToShelterMin?: number;
  stopsCompleted?: number;
  stopsTotal?: number;
  planRevisionsCount?: number;
  timeline?: Array<{
    phase: string;
    plannedLtst: string;
    actualLtst: string;
  }>;
  alerts?: Array<{
    level: "warning" | "caution" | "advisory";
    code: string;
    message: string;
    raisedLtst: string;
    ackedLtst: string;
    shelteredLtst?: string;
    responseSec: number;
  }>;
  tasks?: Array<{
    stopName: string;
    ev1: string;
    ev2: string;
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
  onBack?: () => void;
  className?: string;
}

/** Mandatory NASA Space Apps disclaimer (01 §F.1); independent of any report data. */
export const REPORT_DISCLAIMER =
  "NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map. " +
  "For simulation and educational demonstration only; not certified for actual Martian flight or surface operations.";

/**
 * Attributes for a report value. Present: its class and `report:<path>` source. Missing: the field's own class is kept,
 * and the value is flagged `data-unavailable` with an `unavailable:report.<path>` source (never labelled `assumed`).
 */
function reportAttrs(present: boolean, prov: Provenance, path: string): ReturnType<typeof provAttrs> {
  return provAttrs(present ? { prov, src: `report:${path}` } : unavailableOf(prov, `report.${path}`));
}

/** Glyph beside a report value: its own class when present, none beside "—". */
const glyphIf = (present: boolean, prov: Provenance): string => (present ? PROVENANCE_GLYPHS[prov] : "");

export function PostEvaReport({
  report,
  onPrint,
  onBack,
  className = "",
}: PostEvaReportProps): ReactElement {
  const data: PostEvaReportData = report ?? {};
  const hasReceived = isFiniteNumber(data.doseReceivedUgy);
  const hasUnsheltered = isFiniteNumber(data.doseUnshelteredUgy);
  const hasShelter = isFiniteNumber(data.timeToShelterMin);
  const hasStops = isFiniteNumber(data.stopsCompleted) && isFiniteNumber(data.stopsTotal);
  const hasRevisions = isFiniteNumber(data.planRevisionsCount);

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
            p. 1 / 2
          </span>
        </header>

        {/* 4 Stat Slabs (04 §E.8) */}
        <section aria-label="Key mission statistics" style={slabGridStyle}>
          <div style={slabStyle}>
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
                {hasReceived ? fmtFixed(data.doseReceivedUgy, 1) : UNAVAILABLE} µGy {glyphIf(hasReceived, "simulated")}
              </span>
              <span style={{ fontSize: "12px", color: "#6B7280", margin: "0 4px" }}>vs</span>
              <span {...reportAttrs(hasUnsheltered, "simulated", "dose_event_unsheltered_ugy")} style={{ color: "#4B5563" }}>
                {hasUnsheltered ? (data.doseUnshelteredUgy as number).toLocaleString("en-US") : UNAVAILABLE} µGy{" "}
                {glyphIf(hasUnsheltered, "simulated")}
              </span>
            </span>
          </div>

          <div style={slabStyle}>
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

          <div style={slabStyle}>
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

          <div style={slabStyle}>
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
                <th style={thStyle}>Phase</th>
                <th style={thStyle}>Planned LTST</th>
                <th style={thStyle}>Actual LTST</th>
              </tr>
            </thead>
            <tbody>
              {(data.timeline ?? []).length === 0 && (
                <tr>
                  <td style={tdStyle} {...reportAttrs(false, "simulated", "timeline")} colSpan={3}>
                    {UNAVAILABLE}
                  </td>
                </tr>
              )}
              {data.timeline?.map((row, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{row.phase}</td>
                  <td style={tdStyle} {...reportAttrs(true, "derived", "timeline.planned_ltst")}>
                    {row.plannedLtst}
                  </td>
                  <td
                    style={{ ...tdStyle, fontWeight: row.actualLtst.includes("DROPPED") ? 700 : 400 }}
                    {...reportAttrs(true, "simulated", "timeline.actual_ltst")}
                  >
                    {row.actualLtst}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <th style={thStyle}>Raised → Acked → Sheltered</th>
                <th style={thStyle}>Response Time</th>
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
                    <div style={{ fontSize: "12px", color: "#6B7280" }}>{alt.message}</div>
                  </td>
                  <td style={tdStyle} {...reportAttrs(true, "simulated", "alerts.times")}>
                    {alt.raisedLtst} → {alt.ackedLtst} {alt.shelteredLtst ? `→ ${alt.shelteredLtst}` : ""}
                  </td>
                  <td style={tdStyle} {...reportAttrs(isFiniteNumber(alt.responseSec), "derived", "alerts.response_s")}>
                    {isFiniteNumber(alt.responseSec) ? alt.responseSec : UNAVAILABLE} s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Map trace: no fabricated schematic. The real trace needs the session position log (not wired). */}
        <section aria-label="Map Trace">
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
            [ MAP /// MAP TRACE ]
          </h2>
          <p
            style={{ fontSize: "12px", color: "#6B7280", margin: "4px 0" }}
            {...reportAttrs(false, "simulated", "map_trace")}
          >
            {UNAVAILABLE} Trace not available: it needs the session position log.
          </p>
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
            p. 2 / 2
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
                <th style={thStyle}>EV1 (Done / Skip / Drop)</th>
                <th style={thStyle}>EV2 (Done / Skip / Drop)</th>
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
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono, monospace)" }} {...reportAttrs(true, "simulated", "tasks.ev1")}>
                    {t.ev1}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono, monospace)" }} {...reportAttrs(true, "simulated", "tasks.ev2")}>
                    {t.ev2}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: "12px", color: "#6B7280", margin: "4px 0 8px 0" }}>
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
                    {UNAVAILABLE}
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
              color: "#6B7280",
              margin: "6px 0 0 0",
              lineHeight: 1.4,
              borderTop: "1px solid #E5E7EB",
              paddingTop: "6px",
            }}
          >
            {REPORT_DISCLAIMER}
            {data.disclaimer ? ` ${data.disclaimer}` : ""}
          </p>
        </footer>
      </article>
    </div>
  );
}
