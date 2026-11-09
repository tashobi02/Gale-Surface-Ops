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
 */

import type { CSSProperties, ReactElement } from "react";
import type { Provenance } from "@marswalk/protocol";

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
  disclaimer?: string;
}

export interface PostEvaReportProps {
  report?: PostEvaReportData;
  onPrint?: () => void;
  onBack?: () => void;
  className?: string;
}

const DEFAULT_REPORT_DATA: PostEvaReportData = {
  sessionId: "storm-sol4190",
  scenarioId: "storm-sol4190",
  dataVersion: "gale_boxwork-2026.11.08",
  seed: 4190,
  logHash: "b1fa5ad968d4f29a00839e44bc6079c6fa301e7e4cbb46e53995818ad5b1fa5a",
  doseReceivedUgy: 120.5,
  doseUnshelteredUgy: 8100.0,
  timeToShelterMin: 14,
  stopsCompleted: 1,
  stopsTotal: 3,
  planRevisionsCount: 1,
  timeline: [
    { phase: "EGRESS", plannedLtst: "13:00", actualLtst: "13:00" },
    { phase: "STOP 1 · EZ—ENG 01", plannedLtst: "13:04", actualLtst: "13:04" },
    { phase: "STOP 2 · EZ—RES 02", plannedLtst: "13:14", actualLtst: "13:05 (alert)" },
    { phase: "STOP 3 · EZ—SCI 01 (dropped)", plannedLtst: "13:30", actualLtst: "DROPPED" },
    { phase: "INGRESS (PR1 Rendezvous)", plannedLtst: "13:45", actualLtst: "13:19" },
  ],
  alerts: [
    {
      level: "warning",
      code: "RADIATION_ALERT",
      message: "SOLAR PARTICLE EVENT DETECTED (450 µGy/h)",
      raisedLtst: "13:05:00",
      ackedLtst: "13:05:45",
      shelteredLtst: "13:19:00",
      responseSec: 45,
    },
    {
      level: "caution",
      code: "COMM_SHADOW",
      message: "HAB RF TELEMETRY INTERRUPTED",
      raisedLtst: "13:02:10",
      ackedLtst: "13:02:40",
      responseSec: 30,
    },
  ],
  tasks: [
    { stopName: "Stop 1 · EZ—ENG 01", ev1: "2 / 0 / 0", ev2: "2 / 0 / 0" },
    { stopName: "Stop 2 · EZ—RES 02", ev1: "1 / 1 / 1", ev2: "1 / 0 / 2" },
    { stopName: "Stop 3 · EZ—SCI 01 (dropped)", ev1: "0 / 0 / 3", ev2: "0 / 0 / 3" },
  ],
  logEvents: [
    { seq: 1, time: "13:00:00", actor: "system", event: "SESSION_LOADED — storm-sol4190", prov: "simulated" },
    { seq: 2, time: "13:00:10", actor: "system", event: "EVA_STARTED — crew EV1, EV2", prov: "simulated" },
    { seq: 5, time: "13:04:00", actor: "system", event: "ARRIVED_STOP — wp-1 (Stop 1)", prov: "simulated" },
    { seq: 7, time: "13:05:00", actor: "system", event: "ALERT_RAISED — RADIATION_ALERT (warning)", prov: "replayed" },
    { seq: 8, time: "13:05:45", actor: "ops", event: "ALERT_ACKED — alt-01 by ops", prov: "measured" },
    { seq: 9, time: "13:06:00", actor: "ops", event: "PLAN_REVISED — option 1 rendezvous (drops wp-2)", prov: "derived" },
    { seq: 11, time: "13:19:00", actor: "system", event: "CREW_SHELTERED — EV1 in PR1 (dose 120.5 µGy)", prov: "measured" },
    { seq: 12, time: "13:20:00", actor: "ops", event: "EVA_ENDED — mission completed safely", prov: "simulated" },
  ],
  disclaimer:
    "NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map. " +
    "For simulation and educational demonstration only; not certified for actual Martian flight or surface operations.",
};

const PROVENANCE_GLYPHS: Record<Provenance, string> = {
  measured: "■",
  derived: "◆",
  modelled: "○",
  assumed: "△",
  replayed: "▶",
  simulated: "◇",
};

export function PostEvaReport({
  report = DEFAULT_REPORT_DATA,
  onPrint,
  onBack,
  className = "",
}: PostEvaReportProps): ReactElement {
  const data = { ...DEFAULT_REPORT_DATA, ...report };

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
    borderRadius: "2px",
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
    fontSize: "11px",
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
                borderRadius: "2px",
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
            borderRadius: "2px",
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
                fontSize: "11px",
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
              Storm at Sol 4190 — Mission Debrief
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
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#4B5563" }}>
              DOSE RECEIVED VS UNSHELTERED
            </span>
            <span
              style={{
                fontSize: "20px",
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              <span data-provenance="measured">{data.doseReceivedUgy?.toFixed(1)} µGy ■</span>
              <span style={{ fontSize: "12px", color: "#6B7280", margin: "0 4px" }}>vs</span>
              <span data-provenance="replayed" style={{ color: "#DC2626" }}>
                {data.doseUnshelteredUgy?.toLocaleString()} µGy ▶
              </span>
            </span>
          </div>

          <div style={slabStyle}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#4B5563" }}>
              TIME TO SHELTER
            </span>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
              data-provenance="derived"
            >
              {data.timeToShelterMin} min ◆
            </span>
          </div>

          <div style={slabStyle}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#4B5563" }}>
              STOPS COMPLETED
            </span>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
              data-provenance="simulated"
            >
              {data.stopsCompleted} / {data.stopsTotal} ◇
            </span>
          </div>

          <div style={slabStyle}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#4B5563" }}>
              PLAN REVISIONS
            </span>
            <span
              style={{
                fontSize: "22px",
                fontWeight: 700,
                fontFamily: "var(--font-mono, monospace)",
              }}
              data-provenance="derived"
            >
              REV 0 → {data.planRevisionsCount} ◆
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
              {data.timeline?.map((row, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{row.phase}</td>
                  <td style={tdStyle}>{row.plannedLtst}</td>
                  <td style={{ ...tdStyle, fontWeight: row.actualLtst.includes("DROPPED") ? 700 : 400 }}>
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
              {data.alerts?.map((alt, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>
                    <span
                      style={{
                        padding: "2px 6px",
                        backgroundColor: alt.level === "warning" ? "#FEE2E2" : "#FEF3C7",
                        color: alt.level === "warning" ? "#991B1B" : "#92400E",
                        borderRadius: "2px",
                        fontWeight: 700,
                        fontSize: "11px",
                      }}
                    >
                      {alt.level.toUpperCase()}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{alt.code}</div>
                    <div style={{ fontSize: "11px", color: "#6B7280" }}>{alt.message}</div>
                  </td>
                  <td style={tdStyle}>
                    {alt.raisedLtst} → {alt.ackedLtst} {alt.shelteredLtst ? `→ ${alt.shelteredLtst}` : ""}
                  </td>
                  <td style={tdStyle}>{alt.responseSec} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Map Trace (Schematic) */}
        <section aria-label="Map Trace">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
              [ MAP /// MAP TRACE (30 s decimated) ]
            </h2>
            <span style={{ fontSize: "11px", color: "#6B7280", fontStyle: "italic" }}>
              SCHEMATIC — not real terrain
            </span>
          </div>

          <div
            style={{
              height: "220px",
              border: "1px solid #D1D5DB",
              borderRadius: "2px",
              backgroundColor: "#F9FAFB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 700 220"
              style={{ width: "100%", height: "100%" }}
              aria-label="Schematic mission route trace"
            >
              {/* Grid lines */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E5E7EB" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />

              {/* Comm coverage circle */}
              <circle cx="120" cy="110" r="90" fill="#EBF5FF" stroke="#93C5FD" strokeDasharray="4 4" />
              <text x="120" y="50" fontSize="10" fill="#6B7280" textAnchor="middle">
                HAB COMM COVERAGE (600 m)
              </text>

              {/* Planned route */}
              <path
                d="M 120 110 L 260 70 L 420 90 L 580 150"
                fill="none"
                stroke="#9CA3AF"
                strokeWidth="2"
                strokeDasharray="4 4"
              />

              {/* Traversed path */}
              <path
                d="M 120 110 L 260 70 L 400 85"
                fill="none"
                stroke="#111827"
                strokeWidth="3"
              />

              {/* PR1 Rendezvous vector */}
              <path
                d="M 380 160 L 400 85"
                fill="none"
                stroke="#DC2626"
                strokeWidth="2.5"
              />

              {/* Markers */}
              <circle cx="120" cy="110" r="6" fill="#111827" />
              <text x="120" y="130" fontSize="11" fontWeight="700" textAnchor="middle" fill="#111827">
                HAB
              </text>

              <circle cx="260" cy="70" r="5" fill="#111827" />
              <text x="260" y="55" fontSize="10" fontWeight="600" textAnchor="middle" fill="#111827">
                STOP 1 ✓
              </text>

              <circle cx="400" cy="85" r="7" fill="#DC2626" />
              <text x="400" y="70" fontSize="11" fontWeight="700" textAnchor="middle" fill="#DC2626">
                RDV SHELTER (PR1)
              </text>

              <circle cx="580" cy="150" r="4" fill="#9CA3AF" />
              <text x="580" y="170" fontSize="10" textAnchor="middle" fill="#6B7280">
                STOP 3 (DROPPED)
              </text>
            </svg>
          </div>
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
                fontSize: "11px",
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
                fontSize: "11px",
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
              {data.tasks?.map((t, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{t.stopName}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono, monospace)" }}>{t.ev1}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono, monospace)" }}>{t.ev2}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: "11px", color: "#6B7280", margin: "4px 0 8px 0" }}>
            Dropped tasks: Open tasks closed when the rendezvous option revised the plan (Stop 2 was cut short and Stop 3 was dropped).
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
              {data.logEvents?.map((evt) => (
                <tr key={evt.seq}>
                  <td style={tdStyle}>{evt.seq}</td>
                  <td style={tdStyle}>{evt.time}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{evt.actor}</td>
                  <td style={tdStyle}>{evt.event}</td>
                  <td style={tdStyle}>
                    <span data-provenance={evt.prov}>
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
            fontSize: "11px",
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
              {data.logHash}
            </span>

            <span style={{ fontWeight: 700, textTransform: "uppercase" }}>SCENARIO</span>
            <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
              {data.scenarioId} · seed {data.seed} · {data.dataVersion}
            </span>
          </div>

          <p
            style={{
              fontSize: "10px",
              color: "#6B7280",
              margin: "6px 0 0 0",
              lineHeight: 1.4,
              borderTop: "1px solid #E5E7EB",
              paddingTop: "6px",
            }}
          >
            {data.disclaimer}
          </p>
        </footer>
      </article>
    </div>
  );
}
