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
  useCallback,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { Crew, CrewId, Vehicle, Alert, Snapshot, Command } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { AlertStack } from "../ops/AlertStack";
import { OptionsPanel } from "../ops/OptionsPanel";
import { ClockControl } from "../ops/ClockControl";
import { ConditionsPanel, type ConditionsState, type ProvenanceValue } from "../ops/ConditionsPanel";
import { TaskProgress } from "../ops/TaskProgress";
import { AddTaskPopover } from "../ops/AddTaskPopover";
import {
  PROVENANCE_GLYPHS,
  UNAVAILABLE,
  fmtFixed,
  fmtInt,
  isFiniteNumber,
  provAttrs,
  unavailableOf,
} from "../components/provenance";

/** Task counts for one crew member, reduced from the task list by the caller. null counts render "—". */
export interface CrewTaskProgress {
  stop: { stopId?: string; stopNo: number; done: number; total: number } | null;
  total: { done: number; total: number } | null;
}

/** One line of the event log footer, already worded and sourced by the caller. */
export interface OpsLogLine {
  key: string;
  text: string;
  prov: ProvenanceValue<string>["prov"];
  src: string;
}

export interface OpsConsoleProps {
  scenarioName?: string;
  sol?: ProvenanceValue<number>;
  ltst?: ProvenanceValue<string>;
  planRevision?: ProvenanceValue<number>;
  /** Current EVA phase, when the Hab Core reports one. */
  phase?: ProvenanceValue<string>;
  /** Fallbacks for the clock when no snapshot is available; the snapshot's session clock wins. Unset = unknown. */
  clockSpeed?: 1 | 10 | 60;
  isPaused?: boolean;
  crew?: Crew[];
  vehicles?: Vehicle[];
  alerts?: Alert[];
  /** Per-crew task counts. A crew member without an entry shows "—". */
  taskProgress?: Partial<Record<CrewId, CrewTaskProgress>>;
  /** Conditions for the right column; missing fields render "—". */
  conditions?: Partial<ConditionsState>;
  /** Hab Core client and snapshot, so the options panel can list and approve real options. */
  client?: HabClient | null;
  snapshot?: Snapshot | null;
  /** Event log lines; none means the footer reads "—". */
  logLines?: OpsLogLine[];
  /** Called with the alert's id once the Hab Core accepted ACK_ALERT (or at once when no client is given). */
  onAcknowledgeAlert?: (alertId: string) => void;
  /** Receives every command the console issues when no `client` is given (with a client the console sends them). */
  onCommand?: (command: Pick<Command, "kind" | "args">) => void;
  onApproveOption?: (optionId: string) => void;
  className?: string;
}

/**
 * Crew telemetry is simulated by the Hab Core session (05 Crew), so its values are labelled "simulated". A missing
 * value keeps that class but is flagged `data-unavailable` with an `unavailable:` source and shows no glyph.
 */
function crewAttr(path: string, present = true): ReturnType<typeof provAttrs> {
  return provAttrs(present ? { prov: "simulated", src: `snapshot:${path}` } : unavailableOf("simulated", path));
}

/** Glyph next to a crew value: its own class when present, none beside "—". */
const simGlyph = (present: boolean): string => (present ? PROVENANCE_GLYPHS.simulated : "");

/** Provenance attributes for a top-bar metadata value; a missing value is flagged unavailable (class unknown). */
function metaAttrs(pv: ProvenanceValue<unknown> | undefined, path: string): ReturnType<typeof provAttrs> {
  return provAttrs(pv ? { prov: pv.prov, src: pv.src } : unavailableOf(null, `session.${path}`));
}

/** Placement of an item on the schematic's footer line: working-projection metres, or "—". */
function metres(v: unknown): string {
  return isFiniteNumber(v) ? `${v >= 0 ? "+" : ""}${Math.round(v)}m` : UNAVAILABLE;
}

/**
 * SCR-11 Ops Console.
 * Mode OPS: Dark theme (#0B0D10 void, #14181D panel, #1C2128 raised, #ECEFF2 text-1).
 * No sample data: every list defaults to empty and every missing value reads "—" (04 §D.1).
 */
export function OpsConsole({
  scenarioName,
  sol,
  ltst,
  planRevision,
  phase,
  clockSpeed,
  isPaused,
  crew = [],
  vehicles = [],
  alerts = [],
  taskProgress = {},
  conditions,
  client,
  snapshot,
  logLines = [],
  onAcknowledgeAlert,
  onApproveOption,
  onCommand,
  className = "",
}: OpsConsoleProps): ReactElement {
  const [activeAddCrew, setActiveAddCrew] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  // The session is read from the snapshot (given, or the client's own), so the clock and status follow the server.
  const subscribe = useCallback((listener: () => void) => client?.subscribe(listener) ?? (() => {}), [client]);
  const readState = useCallback(() => client?.state() ?? null, [client]);
  const liveState = useSyncExternalStore(subscribe, readState, readState);
  const session = (snapshot ?? liveState)?.session;

  /**
   * Sends one command to the Hab Core (02 §E.4). Without a client the command goes to `onCommand` and counts as
   * issued. Returns true when it was accepted; a rejection is shown, not swallowed.
   */
  const issue = async (command: Pick<Command, "kind" | "args">): Promise<boolean> => {
    if (!client) {
      onCommand?.(command);
      return true;
    }
    const result = await client.send(command);
    setCommandError(result.ok ? null : `${command.kind} rejected: ${result.message}`);
    return result.ok;
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
    fontSize: "12px",
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
            ⬢ OPS · {scenarioName ?? UNAVAILABLE}
          </span>
          <span
            className="meta-strip"
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12px",
              color: "var(--text-2, #A9B3BE)",
            }}
          >
            <span {...metaAttrs(sol, "sol")}>SOL {sol ? fmtInt(sol.v) : UNAVAILABLE}</span> ·{" "}
            <span {...metaAttrs(ltst, "ltst")}>LTST {ltst && ltst.v ? ltst.v : UNAVAILABLE}</span> ·{" "}
            <span {...metaAttrs(planRevision, "planRevision")}>
              REV {planRevision && isFiniteNumber(planRevision.v) ? String(planRevision.v).padStart(2, "0") : UNAVAILABLE}
            </span>
          </span>
        </div>

        {/* Mission clock controls: ⏸ 1× 10× [60×] ⏭ */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ClockControl
            speed={session?.clock.speed ?? clockSpeed ?? null}
            isPaused={session?.clock.paused ?? isPaused ?? null}
            sessionState={session?.status}
            activeScenarioId={session?.scenario_id ?? scenarioName}
            onCommand={(command) => void issue(command)}
          />
          <span style={{ marginLeft: "8px", cursor: "pointer" }} aria-label="Sound status">
            🔊
          </span>
        </div>
      </header>

      {/* ------------------------------------- EVA Phase (04 §E.4, P4): only what the Hab Core reports */}
      <nav className="phase-timeline" style={timelineStyle} aria-label="EVA Phase Timeline">
        <span>EVA PHASE</span>{" "}
        <span
          style={{ fontWeight: 700, color: "var(--text-1, #ECEFF2)" }}
          {...metaAttrs(phase, "phase")}
        >
          {phase && phase.v ? phase.v : UNAVAILABLE}
        </span>
      </nav>

      {/* ------------------------------------- Alert Slot / Bar (04 §D.2, §E.4) */}
      <AlertStack
        alerts={alerts}
        onAcknowledge={(alertId) => {
          void issue({ kind: "ACK_ALERT", args: { alert_id: alertId } }).then((accepted) => {
            if (accepted) onAcknowledgeAlert?.(alertId);
          });
        }}
      />
      {commandError && (
        <div
          role="status"
          data-slot="command-error"
          style={{
            padding: "6px 16px",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "12px",
            color: "var(--text-1, #ECEFF2)",
            backgroundColor: "var(--raised, #1C2128)",
            borderBottom: "1px solid var(--hairline, #2A313A)",
          }}
        >
          {commandError}
        </div>
      )}

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
                    <span>[{member.crew_id}]</span>
                    <span style={{ fontSize: "12px", textTransform: "uppercase" }} {...crewAttr("crew.activity")}>
                      {member.activity ?? UNAVAILABLE}
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
                        {...provAttrs(
                          isFiniteNumber(member.haven?.minutes)
                            ? { prov: "modelled", src: "snapshot:crew.haven.minutes" }
                            : unavailableOf("modelled", "crew.haven.minutes"),
                        )}
                      >
                        {fmtInt(member.haven?.minutes)} MIN {isFiniteNumber(member.haven?.minutes) ? PROVENANCE_GLYPHS.modelled : ""}
                      </span>
                    </div>
                    <div>
                      O₂{" "}
                      <span className="value" {...crewAttr("crew.o2_frac", isFiniteNumber(member.o2_frac))}>
                        {isFiniteNumber(member.o2_frac) ? Math.round(member.o2_frac * 100) : UNAVAILABLE} %{" "}
                        {simGlyph(isFiniteNumber(member.o2_frac))}
                      </span>
                    </div>
                    <div>
                      DOSE{" "}
                      <span className="value" {...crewAttr("crew.dose_event_ugy", isFiniteNumber(member.dose_event_ugy))}>
                        {isFiniteNumber(member.dose_event_ugy) ? fmtFixed(member.dose_event_ugy / 1000, 1) : UNAVAILABLE} mGy{" "}
                        {simGlyph(isFiniteNumber(member.dose_event_ugy))}
                      </span>
                    </div>
                    <div>
                      LINK{" "}
                      <span className="value" {...crewAttr("crew.linked")}>
                        {isUnlinked ? "LOST" : "▮▮▮"} {PROVENANCE_GLYPHS.simulated}
                      </span>
                    </div>
                  </div>

                  {/* Task progress row (01 FR-50, U-53): counts only when the caller reduced them from the task list */}
                  <TaskProgress
                    crewId={member.crew_id}
                    stopCount={taskProgress[member.crew_id]?.stop ?? null}
                    total={taskProgress[member.crew_id]?.total ?? null}
                    onAdd={(cid) => setActiveAddCrew(cid)}
                    disabled={!taskProgress[member.crew_id]?.stop?.stopId}
                  />

                  {isUnlinked && (
                    <footer
                      style={{
                        fontSize: "12px",
                        color: "var(--status-caution, #FFB020)",
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      ⚠ LAST HEARD{" "}
                      <span {...provAttrs(unavailableOf("simulated", "link.age_seconds"))}>
                        {UNAVAILABLE}
                      </span>{" "}
                      (cached values)
                    </footer>
                  )}
                </article>
              );
            })}
          </div>

          {/* Add Task Popover */}
          {activeAddCrew && taskProgress[activeAddCrew as CrewId]?.stop?.stopId && (
            <div style={{ marginTop: "8px" }}>
              <AddTaskPopover
                crewId={activeAddCrew as CrewId}
                stopId={taskProgress[activeAddCrew as CrewId]!.stop!.stopId!}
                onAdd={() => setActiveAddCrew(null)}
                onCancel={() => setActiveAddCrew(null)}
              />
            </div>
          )}

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
                    [{v.vehicle_id}] {v.kind === "pressurized_rover" ? "Pressurised rover" : "Utility rover"}
                  </span>
                  {/* Activity is a state word in neutral text; no status colour without an actual safety status */}
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--text-2, #A9B3BE)",
                    }}
                    {...crewAttr("vehicles.state")}
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
                  {/* Battery is reported in Wh by the utility rover only; no percentage is inferred */}
                  BATTERY{" "}
                  <span {...crewAttr("vehicles.battery_wh", v.kind === "utility_rover" && isFiniteNumber(v.battery_wh))}>
                    {v.kind === "utility_rover" && isFiniteNumber(v.battery_wh)
                      ? `${Math.round(v.battery_wh)} Wh ${PROVENANCE_GLYPHS.simulated}`
                      : UNAVAILABLE}
                  </span>
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
            MAP VIEWPORT · PROJECTION IAU_2015:49900
          </div>

          <footer
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12px",
              color: "var(--text-3, #8592A0)",
            }}
          >
            {crew.length === 0 && vehicles.length === 0
              ? UNAVAILABLE
              : [
                  ...crew.map((c) => (
                    <span key={c.crew_id} {...crewAttr("crew.position")}>
                      {c.crew_id} [{metres(c.x_m)}, {metres(c.y_m)}] ·{" "}
                    </span>
                  )),
                  ...vehicles.map((v) => (
                    <span key={v.vehicle_id} {...crewAttr("vehicles.position")}>
                      {v.vehicle_id} [{metres(v.x_m)}, {metres(v.y_m)}] ·{" "}
                    </span>
                  )),
                ]}
          </footer>
        </section>

        {/* Right Column: CONDITIONS, EARTH LINK, OPTIONS */}
        <aside style={rightColumnStyle}>
          {/* Module Label: CONDITIONS */}
          <div className="module-label" style={moduleLabelStyle}>
            [ ENVIRONMENT /// CONDITIONS ]
          </div>
          <ConditionsPanel variant="ops" conditions={conditions} />

          {/* Module Label: OPTIONS (04 §D.3, §E.4) */}
          <div className="module-label" style={{ ...moduleLabelStyle, marginTop: "12px" }}>
            [ SAFETY /// OPTIONS ]
          </div>
          <div className="options-panel">
            <OptionsPanel
              client={client}
              snapshot={snapshot ?? liveState}
              crewId={crew[0]?.crew_id ?? (snapshot ?? liveState)?.crew[0]?.crew_id ?? null}
              onApproveOption={(opt) => onApproveOption?.(opt.option_id)}
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
        {logLines.length === 0 ? (
          <span {...provAttrs(unavailableOf(null, "event_log"))}>{UNAVAILABLE}</span>
        ) : (
          logLines.map((line) => (
            <span key={line.key} {...provAttrs({ prov: line.prov, src: line.src })}>
              {line.text} {PROVENANCE_GLYPHS[line.prov]}
            </span>
          ))
        )}
      </footer>
    </div>
  );
}
