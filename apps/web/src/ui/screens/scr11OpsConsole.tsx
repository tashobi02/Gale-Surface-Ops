/**
 * SCR-11 — Ops console (docs/specs/03 §B; layout in 04 §E.4; mode OPS, 04 §B.2).
 * Implementation: T25.01 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Requirements: FR-30–FR-38, FR-40, FR-42–FR-46, NFR-04, NFR-05.
 * Fixed geography, 3-column layout on ≥ 1280 px (projector-readable).
 * Slots: Top bar with clock controls, EVA phase timeline, Alert bar with latching/ACK,
 * Left column (Crew & Vehicle specimen cards), Center column (Shared Map),
 * Right column (Conditions, Earth Link, Contingency Options with 800ms hold-to-confirm),
 * Bottom bar (Event log).
 *
 * Every mission value carries data-provenance (04 §A.3 #8, FR-15).
 * Status colours mean status only — never brand orange in OPS (04 §A.3.1).
 */

import {
  useState,
  useRef,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { Crew, Vehicle, Alert, Provenance } from "@marswalk/protocol";
import { AlertStack } from "../ops/AlertStack";
import { OptionsPanel } from "../ops/OptionsPanel";
import { ClockControl } from "../ops/ClockControl";

export interface OpsConsoleProps {
  scenarioName?: string;
  sol?: number;
  ltst?: string;
  planRevision?: number;
  clockSpeed?: number;
  isPaused?: boolean;
  crew?: Crew[];
  vehicles?: Vehicle[];
  alerts?: Alert[];
  onAcknowledgeAlert?: (alertSeq: number) => void;
  onApproveOption?: (optionId: string) => void;
  onClockCommand?: (cmd: "PAUSE" | "RESUME" | "SET_SPEED" | "STEP", speed?: number) => void;
  className?: string;
}

const PROVENANCE_GLYPHS: Record<Provenance, string> = {
  measured: "■",
  derived: "◆",
  modelled: "○",
  assumed: "△",
  replayed: "▶",
  simulated: "◇",
};

/**
 * SCR-11 Ops Console.
 * Mode OPS: Dark theme (#0B0D10 void, #14181D panel, #1C2128 raised, #ECEFF2 text-1).
 */
export function OpsConsole({
  scenarioName = "storm-sol4190",
  sol = 4190,
  ltst = "13:05",
  planRevision = 3,
  clockSpeed = 1,
  isPaused = false,
  crew = [
    {
      crew_id: "EV1",
      x_m: 2410.5,
      y_m: -1875.0,
      activity: "WALKING",
      stop_index: 2,
      o2_frac: 0.71,
      eva_elapsed_s: 3600,
      dose_event_ugy: 0,
      dose_event_unsheltered_ugy: 0,
      haven: { minutes: 14, kind: "vehicle", target_x_m: 2500, target_y_m: -1800 },
      linked: true,
      link_path: ["EV1", "HAB"],
      stale: false,
    },
    {
      crew_id: "EV2",
      x_m: 2380.0,
      y_m: -1890.0,
      activity: "WALKING",
      stop_index: 2,
      o2_frac: 0.74,
      eva_elapsed_s: 3600,
      dose_event_ugy: 0,
      dose_event_unsheltered_ugy: 0,
      haven: { minutes: 15, kind: "vehicle", target_x_m: 2500, target_y_m: -1800 },
      linked: false,
      link_path: [],
      stale: true,
    },
  ],
  vehicles = [
    {
      vehicle_id: "PR1",
      kind: "pressurized_rover",
      param_set: "default",
      x_m: 2500.0,
      y_m: -1800.0,
      state: "PARKED",
      task: null,
      path: [],
      eta_s: null,
      battery_wh: 12000,
    },
  ],
  alerts = [
    {
      alert_id: "alert-042",
      code: "RADIATION_ALERT",
      level: "warning",
      subjects: ["EV1", "EV2"],
      raised_seq: 42,
      acked_seq: null,
      cleared_seq: null,
      acked_by: null,
      message: "SHELTER NOW — RADIATION SURGE (450 mGy/h)",
      data: {},
    },
  ],
  onAcknowledgeAlert,
  onApproveOption,
  onClockCommand,
  className = "",
}: OpsConsoleProps): ReactElement {
  const [activeSpeed, setActiveSpeed] = useState<number>(clockSpeed);
  const [paused, setPaused] = useState<boolean>(isPaused);
  const [optionApproved, setOptionApproved] = useState<boolean>(false);
  const [pressProgress, setPressProgress] = useState<number>(0);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const highestAlert = alerts.find((a) => a.level === "warning") ??
    alerts.find((a) => a.level === "caution") ??
    alerts[0];

  const hasUnacked = alerts.some((a) => a.acked_seq === null);

  const handleHoldStart = () => {
    if (pressTimerRef.current) clearInterval(pressTimerRef.current);
    const start = Date.now();
    pressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / 800);
      setPressProgress(progress);
      if (progress >= 1) {
        clearInterval(pressTimerRef.current!);
        pressTimerRef.current = null;
        setOptionApproved(true);
        onApproveOption?.("option-1");
      }
    }, 50);
  };

  const handleHoldEnd = () => {
    if (pressTimerRef.current) {
      clearInterval(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setPressProgress(0);
  };

  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minHeight: "100vh",
    minWidth: "1280px", // 04 §E.4: Ops console is for ≥ 1280 px
    backgroundColor: "var(--void, #0B0D10)",
    color: "var(--text-1, #ECEFF2)",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    boxSizing: "border-box",
  };

  const topBarStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "48px",
    padding: "0 16px",
    backgroundColor: "var(--panel, #14181D)",
    borderBottom: "1px solid var(--hairline, #2A313A)",
  };

  const timelineStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "6px 16px",
    backgroundColor: "var(--void, #0B0D10)",
    borderBottom: "1px solid var(--hairline, #2A313A)",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "12px",
    color: "var(--text-2, #A9B3BE)",
    textTransform: "uppercase",
  };

  const bodyGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "280px 1fr 320px",
    flex: 1,
    overflow: "hidden",
  };

  const columnStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "16px",
    backgroundColor: "var(--panel, #14181D)",
    borderRight: "1px solid var(--hairline, #2A313A)",
    overflowY: "auto",
  };

  const rightColumnStyle: CSSProperties = {
    ...columnStyle,
    borderRight: "none",
    borderLeft: "1px solid var(--hairline, #2A313A)",
  };

  const moduleLabelStyle: CSSProperties = {
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-3, #8592A0)",
    marginBottom: "4px",
  };

  const cardStyle: CSSProperties = {
    backgroundColor: "var(--raised, #1C2128)",
    border: "1px solid var(--edge, #5C6670)",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  };

  const unlinkedCardStyle: CSSProperties = {
    ...cardStyle,
    border: "1px dashed var(--status-caution, #FFB020)",
    color: "var(--text-2, #A9B3BE)",
    opacity: 0.85,
  };

  const buttonStyle: CSSProperties = {
    minHeight: "32px",
    padding: "4px 12px",
    backgroundColor: "var(--raised, #1C2128)",
    color: "var(--text-1, #ECEFF2)",
    border: "1px solid var(--edge, #5C6670)",
    cursor: "pointer",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "13px",
  };

  return (
    <div
      className={`scr11-ops-console ${className}`}
      data-surface="ops"
      data-mode="ops"
      style={rootStyle}
    >
      {/* ------------------------------------------------ Top Bar (04 §E.4) */}
      <header className="ops-top-bar" style={topBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontWeight: 600, letterSpacing: "0.02em" }}>
            ⬢ OPS · {scenarioName}
          </span>
          <span
            className="meta-strip"
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12px",
              color: "var(--text-2, #A9B3BE)",
            }}
          >
            SOL {sol} · LTST {ltst} · REV 0{planRevision}
          </span>
        </div>

        {/* Mission clock controls: ⏸ 1× 10× [60×] ⏭ */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ClockControl
            speed={activeSpeed as 1 | 10 | 60}
            isPaused={paused}
            activeScenarioId={scenarioName}
            onSetSpeed={(s) => {
              setActiveSpeed(s);
              onClockCommand?.("SET_SPEED", s);
            }}
            onPauseResume={(p) => {
              setPaused(p);
              onClockCommand?.(p ? "PAUSE" : "RESUME");
            }}
            onJumpNextEvent={() => onClockCommand?.("STEP")}
          />
          <span style={{ marginLeft: "8px", cursor: "pointer" }} aria-label="Sound status">
            🔊
          </span>
        </div>
      </header>

      {/* ------------------------------------- EVA Phase Timeline (04 §E.4, P4) */}
      <nav className="phase-timeline" style={timelineStyle} aria-label="EVA Phase Timeline">
        <span>EGRESS</span> ▸ <span>TRAVERSE</span> ▸ <span>STOP 1</span> ▸{" "}
        <span>TRAVERSE</span> ▸{" "}
        <span style={{ fontWeight: 700, color: "var(--text-1, #ECEFF2)" }}>
          ■ STOP 2 (now)
        </span>{" "}
        ▸ <span>TRAVERSE</span> ▸ <span>STOP 3</span> ▸ <span>INGRESS</span>
      </nav>

      {/* ------------------------------------- Alert Slot / Bar (04 §D.2, §E.4) */}
      <AlertStack
        alerts={alerts}
        onAcknowledge={(_id, seq) => onAcknowledgeAlert?.(seq)}
      />

      {/* ---------------------------------------------------- Main Body Grid */}
      <main style={bodyGridStyle}>
        {/* Left Column: CREW & VEHICLES */}
        <aside style={columnStyle}>
          {/* Module Label: CREW (04 P2) */}
          <div className="module-label" style={moduleLabelStyle}>
            [ HAB CORE /// CREW ]
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {crew.map((member) => {
              const isUnlinked = !member.linked || member.stale;
              return (
                <article
                  key={member.crew_id}
                  className={`crew-card ${isUnlinked ? "unlinked is-stale dashed" : ""}`}
                  style={isUnlinked ? unlinkedCardStyle : cardStyle}
                >
                  <header
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontWeight: 600,
                    }}
                  >
                    <span>
                      [{member.crew_id}] {member.crew_id === "EV1" ? "C. Jones" : "M. Taylor"}
                    </span>
                    <span style={{ fontSize: "12px", textTransform: "uppercase" }}>
                      {member.activity}
                    </span>
                  </header>

                  {/* Telemetry rows with data-provenance (04 §A.3 #8, FR-15) */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "6px",
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "13px",
                    }}
                  >
                    <div>
                      HAVEN{" "}
                      <span
                        className="value"
                        data-provenance="modelled"
                        title="Modelled by safe-haven engine (TASK-05b)"
                      >
                        {member.haven?.minutes ?? 14} MIN {PROVENANCE_GLYPHS.modelled}
                      </span>
                    </div>
                    <div>
                      O₂{" "}
                      <span
                        className="value"
                        data-provenance="modelled"
                        title="Modelled consumption rate"
                      >
                        {Math.round((member.o2_frac ?? 0.71) * 100)} % {PROVENANCE_GLYPHS.modelled}
                      </span>
                    </div>
                    <div>
                      DOSE{" "}
                      <span
                        className="value"
                        data-provenance="measured"
                        title="Measured by RAD sensor"
                      >
                        {((member.dose_event_ugy ?? 0) / 1000).toFixed(1)} mGy{" "}
                        {PROVENANCE_GLYPHS.measured}
                      </span>
                    </div>
                    <div>
                      LINK{" "}
                      <span
                        className="value"
                        data-provenance="measured"
                        title="Direct RF telemetry"
                      >
                        {isUnlinked ? "LOST" : "▮▮▮"} {PROVENANCE_GLYPHS.measured}
                      </span>
                    </div>
                  </div>

                  {isUnlinked && (
                    <footer
                      style={{
                        fontSize: "11px",
                        color: "var(--status-caution, #FFB020)",
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      ⚠ LAST HEARD 2m ago (cached values)
                    </footer>
                  )}
                </article>
              );
            })}
          </div>

          {/* Module Label: VEHICLES */}
          <div className="module-label" style={{ ...moduleLabelStyle, marginTop: "12px" }}>
            [ HAB CORE /// VEHICLES ]
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {vehicles.map((v) => (
              <article key={v.vehicle_id} className="vehicle-card" style={cardStyle}>
                <header
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 600,
                  }}
                >
                  <span>
                    [{v.vehicle_id}] {v.kind === "pressurized_rover" ? "Pressurised Rover 1" : "Utility Rover"}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--status-nominal, #3DDC84)",
                    }}
                  >
                    {v.state}
                  </span>
                </header>
                <div
                  style={{
                    fontSize: "12px",
                    fontFamily: "var(--font-mono, monospace)",
                    color: "var(--text-2, #A9B3BE)",
                  }}
                >
                  BATTERY {v.battery_wh ? Math.round(v.battery_wh / 130) : 92}% · {v.state}
                </div>
              </article>
            ))}
          </div>
        </aside>

        {/* Center Column: SHARED MAP SLOT */}
        <section
          className="ops-map-slot"
          style={{
            position: "relative",
            backgroundColor: "#080A0D",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "16px",
          }}
          aria-label="Operations Tactical Surface Map"
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div className="module-label" style={moduleLabelStyle}>
              [ TACTICAL MAP /// IAU_2015:49900 ]
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              <button style={buttonStyle} aria-label="Zoom in">+</button>
              <button style={buttonStyle} aria-label="Zoom out">−</button>
              <button style={buttonStyle} aria-label="Fit view">FIT</button>
            </div>
          </div>

          {/* Center tactical canvas placeholder */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              color: "var(--text-3, #8592A0)",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "13px",
            }}
          >
            MAP VIEWPORT · PROJECTION IAU_2015:49900 · SCALE 1:5000
          </div>

          <footer
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "11px",
              color: "var(--text-3, #8592A0)",
            }}
          >
            HAB [0, 0] · EV1 [+2410m, -1875m] · PR1 [+2500m, -1800m]
          </footer>
        </section>

        {/* Right Column: CONDITIONS, EARTH LINK, OPTIONS */}
        <aside style={rightColumnStyle}>
          {/* Module Label: CONDITIONS */}
          <div className="module-label" style={moduleLabelStyle}>
            [ ENVIRONMENT /// CONDITIONS ]
          </div>
          <div
            className="conditions-panel"
            style={{
              ...cardStyle,
              fontSize: "13px",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            <div>
              Dose rate:{" "}
              <span className="value" data-provenance="replayed">
                0.21 mGy/h {PROVENANCE_GLYPHS.replayed}
              </span>
            </div>
            <div>
              Background:{" "}
              <span className="value" data-provenance="replayed">
                NOMINAL {PROVENANCE_GLYPHS.replayed}
              </span>
            </div>
            <div>
              Sun elev:{" "}
              <span className="value" data-provenance="modelled">
                42.5° {PROVENANCE_GLYPHS.modelled}
              </span>
            </div>
          </div>

          {/* Module Label: EARTH LINK */}
          <div className="module-label" style={{ ...moduleLabelStyle, marginTop: "12px" }}>
            [ ORBITAL /// EARTH LINK ]
          </div>
          <div
            className="earth-link-panel"
            style={{
              ...cardStyle,
              fontSize: "13px",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            <div>Light time: 14:02</div>
            <div>Next pass: MRO 9m</div>
            <div>Queue: ↑1 ↓0</div>
          </div>

          {/* Module Label: OPTIONS (04 §D.3, §E.4) */}
          <div className="module-label" style={{ ...moduleLabelStyle, marginTop: "12px" }}>
            [ SAFETY /// OPTIONS ]
          </div>
          <div className="options-panel">
            <OptionsPanel
              onApproveOption={(opt) => {
                setOptionApproved(true);
                onApproveOption?.(opt.option_id);
              }}
            />
          </div>
        </aside>
      </main>

      {/* ------------------------------------- Bottom Bar: EVENT LOG (TASK-27) */}
      <footer
        className="ops-event-log"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          height: "36px",
          padding: "0 16px",
          backgroundColor: "var(--panel, #14181D)",
          borderTop: "1px solid var(--hairline, #2A313A)",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "12px",
          color: "var(--text-2, #A9B3BE)",
          overflowX: "hidden",
          whiteSpace: "nowrap",
        }}
        aria-label="Mission Event Log Stream"
      >
        <span style={{ fontWeight: 600, color: "var(--text-1, #ECEFF2)" }}>
          EVENT LOG
        </span>
        <span>
          13:04 EV1 arrived stop 2 {PROVENANCE_GLYPHS.simulated} · 13:05 Radiation alert{" "}
          {PROVENANCE_GLYPHS.replayed} · 13:05 Safe haven PR1 assigned{" "}
          {PROVENANCE_GLYPHS.modelled}
        </span>
      </footer>
    </div>
  );
}
