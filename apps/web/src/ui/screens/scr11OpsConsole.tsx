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
 * Package 21: the map column is the shared map with the ops layers (`OpsMap`, T25.02); the utility-rover card shows the
 * rover queue (`RoverQueue`, T29.05) and opens SCR-15 (`RoverTask`, T29.04), whose target is picked on that map.
 *
 * Every mission value carries data-provenance (04 §A.3 #8, FR-15).
 * Status colours mean status only — never brand orange in OPS (04 §A.3.1).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { Crew, CrewId, Vehicle, Alert, Snapshot, Command, ContingencyOption, Provenance } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { useCommand, useEvents, useHabClient, useSnapshot } from "../../state/habSession";
import { useOpsSound } from "../ops/sound";
import { selectOpsProps } from "../ops/liveProps";
import { EarthLinkWidget } from "../ops/EarthLinkWidget";
import { EventLog } from "../ops/EventLog";
import { AlertStack } from "../ops/AlertStack";
import { OptionsPanel } from "../ops/OptionsPanel";
import { ClockControl } from "../ops/ClockControl";
import { ConditionsPanel, type ConditionsState, type ProvenanceValue } from "../ops/ConditionsPanel";
import { TaskProgress } from "../ops/TaskProgress";
import { AddTaskPopover } from "../ops/AddTaskPopover";
import { OpsMap } from "../ops/OpsMap";
import { RoverQueue } from "../ops/RoverQueue";
import { QrDrawer } from "../ops/QrDrawer";
import { RoverTask } from "./scr15RoverTask";
import {
  PROVENANCE_GLYPHS,
  UNAVAILABLE,
  fmtFixed,
  fmtInt,
  isFiniteNumber,
  provAttrs,
  unavailableOf,
} from "../components/provenance";

/** FD-018: the sound indicator's longest label, shown until the first gesture arms audio. It also sizes the button. */
const SOUND_LABEL_ARM = "SOUND ON — click to arm";

/** Task counts for one crew member, reduced from the task list by the caller. null counts render "—". */
export interface CrewTaskProgress {
  stop: { stopId?: string; stopNo: number; done: number; total: number } | null;
  total: { done: number; total: number } | null;
}

/** One line of the event log footer, already worded and sourced by the caller. */
export interface OpsLogLine {
  key: string;
  text: string;
  /** The line's own provenance class; null when the event gives none (the strip then shows an unavailable marker). */
  prov: Provenance | null;
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
  /**
   * Hab Core client and snapshot, so the options panel can list and approve real options. Omitted means the tab's
   * session (state/habSession.ts), null means none.
   */
  client?: HabClient | null;
  snapshot?: Snapshot | null;
  /** Event log lines; none means the footer reads "—". */
  logLines?: OpsLogLine[];
  /** Called with the alert's id once the Hab Core accepted ACK_ALERT (or at once when no client is given). */
  onAcknowledgeAlert?: (alertId: string) => void;
  /** Receives every command the console issues when no `client` is given (with a client the console sends them). */
  onCommand?: (command: Pick<Command, "kind" | "args">) => void;
  onApproveOption?: (optionId: string) => void;
  /** Alert sound state, when the caller knows it; unset = unknown. */
  soundOn?: boolean;
  onToggleSound?: () => void;
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
  client: clientProp,
  snapshot,
  logLines: logLinesProp,
  onAcknowledgeAlert,
  onApproveOption,
  soundOn,
  onToggleSound,
  onCommand,
  className = "",
}: OpsConsoleProps): ReactElement {
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === "undefined" ? 1280 : window.innerWidth);
  const [sideDrawer, setSideDrawer] = useState<"crew" | "mission" | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const sideOpener = useRef<HTMLButtonElement | null>(null);
  const crewPanelRef = useRef<HTMLElement>(null);
  const [localSoundOn, setLocalSoundOn] = useState(true);
  const soundEnabled = soundOn ?? localSoundOn;
  useEffect(() => {
    const resize = (): void => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const narrow = viewportWidth < 1280;
  const [activeAddCrew, setActiveAddCrew] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContingencyOption | null>(null);
  const previewPath = useCallback((_path: [number, number][], option?: ContingencyOption | null) => setPreview(option ?? null), []);
  const client = useHabClient(clientProp);
  const [roverTask, setRoverTask] = useState<string | null>(null);
  const roverOpener = useRef<HTMLButtonElement | null>(null);
  const roverPanelRef = useRef<HTMLDivElement>(null);
  const [picking, setPicking] = useState(false);
  const [pickedTarget, setPickedTarget] = useState<{ x_m: number; y_m: number } | null>(null);
  const openRoverTask = (vehicleId: string, opener: HTMLButtonElement): void => {
    roverOpener.current = opener;
    setPickedTarget(null);
    setPicking(false);
    setRoverTask(vehicleId);
  };
  const closeRoverTask = (): void => {
    setRoverTask(null);
    setPicking(false);
    roverOpener.current?.focus();
  };
  useEffect(() => {
    if (roverTask) roverPanelRef.current?.focus();
  }, [roverTask]);
  const [logOpen, setLogOpen] = useState(false);
  const stripRef = useRef<HTMLButtonElement>(null);
  const closeLog = useCallback(() => {
    setLogOpen(false);
    stripRef.current?.focus();
  }, []);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (logOpen) closeRef.current?.focus();
  }, [logOpen]);
  // The session is read from the snapshot (given, or the client's own), so the clock and status follow the server.
  const liveState = useSnapshot(client);
  const events = useEvents(client);
  const send = useCommand(client);
  const activeSnapshot = snapshot === undefined ? liveState : snapshot;
  const session = activeSnapshot?.session;
  const { armed, consumeArmingGesture } = useOpsSound(alerts, soundEnabled, session?.session_id);
  const logLines = logLinesProp ?? selectOpsProps(activeSnapshot, events).logLines ?? [];
  const raisedTimes = new Map(events.filter((event) => event.kind === "ALERT_RAISED").map((event) => [event.seq, event.sim_time]));
  useEffect(() => {
    if (session?.status === "ENDED") window.location.hash = "#/report";
  }, [session?.status]);
  const warningKey = alerts.filter((alert) => alert.level === "warning" && (alert.acked_seq === null || alert.cleared_seq === null)).map((alert) => `${alert.alert_id}/${alert.raised_seq}`).join("|");
  const atTaskLimit = (crewId: CrewId): boolean => {
    const stop = taskProgress[crewId]?.stop;
    if (!stop?.stopId) return false;
    return activeSnapshot?.tasks ? activeSnapshot.tasks.filter((task) => task.stop_id === stop.stopId && task.state !== "DROPPED" && (task.crew_id === crewId || task.crew_id === null)).length >= 4 : stop.total >= 4;
  };
  const optionsRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (warningKey) {
      setActiveAddCrew(null);
      setLogOpen(false);
      setJoinOpen(false);
      if (narrow) setSideDrawer("mission");
      optionsRef.current?.focus();
    }
  }, [warningKey, narrow]);
  useEffect(() => {
    if (sideDrawer === "mission") optionsRef.current?.focus();
    else if (sideDrawer === "crew") crewPanelRef.current?.focus();
  }, [sideDrawer]);
  const toggleSideDrawer = (drawer: "crew" | "mission", opener: HTMLButtonElement): void => {
    sideOpener.current = opener;
    setLogOpen(false);
    setJoinOpen(false);
    setSideDrawer(sideDrawer === drawer ? null : drawer);
  };
  const closeSideDrawer = (): void => {
    setSideDrawer(null);
    sideOpener.current?.focus();
  };

  /**
   * Sends one command to the Hab Core (02 §E.4). Without a client the command goes to `onCommand` and counts as
   * issued. Returns true when it was accepted; a rejection is shown, not swallowed.
   */
  const issue = async (command: Pick<Command, "kind" | "args">): Promise<boolean> => {
    if (!client) {
      onCommand?.(command);
      return true;
    }
    try {
      const result = await send(command);
      setCommandError(result.ok ? null : `${command.kind} rejected: ${result.message}`);
      return result.ok;
    } catch (err) {
      setCommandError(`${command.kind} failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  };

  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minHeight: "100vh",
    minWidth: 0,
    backgroundColor: "var(--void, #0B0D10)",
    color: "var(--text-1, #ECEFF2)",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    boxSizing: "border-box",
  };

  const topBarStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: "48px",
    flexWrap: "wrap",
    // The join popover hangs from the top bar (QrDrawer), so it stays inside the viewport however the bar wraps.
    position: "relative",
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
    gridTemplateColumns: narrow ? "1fr" : "280px minmax(0, 1fr) 320px",
    position: "relative",
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
    if (viewportWidth < 1024 || event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) return;
    const key = event.key.toLowerCase();
    // Space activates a focused control (button, link, row, radio); only digits and letters reach the clock from there.
    if (key === " " && event.target instanceof Element && event.target.closest('button, a[href], [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"]')) return;
    if (key === "o") {
      event.preventDefault();
      if (narrow) { setLogOpen(false); setJoinOpen(false); setSideDrawer("mission"); }
      optionsRef.current?.focus();
      return;
    }
    if (key === "k") {
      const button = consoleRef.current?.querySelector<HTMLButtonElement>('.alert-bar button[aria-label^="Acknowledge"]');
      if (button) { event.preventDefault(); button.click(); }
      return;
    }
    if (!session || session.status === "ENDED") return;
    if (key === " ") { event.preventDefault(); void issue({ kind: "SET_CLOCK", args: { paused: !session.clock.paused } }); }
    else if (["1", "2", "3"].includes(key)) { event.preventDefault(); void issue({ kind: "SET_CLOCK", args: { speed: ({ "1": 1, "2": 10, "3": 60 } as Record<string, number>)[key] } }); }
    else if (key === "n") { event.preventDefault(); void issue({ kind: "JUMP_NEXT_EVENT", args: {} }); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  if (viewportWidth < 1024) return <main data-surface="ops" data-mode="ops" style={{ ...rootStyle, padding: "32px" }}><h1>Use a larger screen</h1><p>The ops console needs at least 1024 px width. Open it on the projector or a laptop.</p></main>;

  return (
    <div
      ref={consoleRef}
      className={`scr11-ops-console ${className}`}
      data-surface="ops"
      data-mode="ops"
      style={rootStyle}
    >
      {/* ------------------------------------------------ Top Bar (04 §E.4) */}
      <header className="ops-top-bar" style={topBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span data-provenance="simulated" data-source={scenarioName ? "snapshot:session.scenario_id" : "unavailable:session.scenario_id"} data-unavailable={scenarioName ? undefined : "true"} style={{ fontWeight: 600, letterSpacing: "0.02em" }}>
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
          <QrDrawer open={joinOpen} onOpenChange={(open) => { setJoinOpen(open); if (open) { setSideDrawer(null); setLogOpen(false); } }} />
          <ClockControl
            speed={session?.clock.speed ?? clockSpeed ?? null}
            isPaused={session?.clock.paused ?? isPaused ?? null}
            sessionState={session?.status}
            activeScenarioId={session?.scenario_id ?? scenarioName}
            onCommand={(command) => void issue(command)}
          />
          <button
            type="button"
            // The first pointer or key gesture arms audio and shortens this label. A header that fits in one row only with the short
            // label would reflow under that very gesture and move the control it is about to click (the press lands on one element,
            // the release on another, so the click is lost). Reserve the longest label's width so arming never changes the layout.
            style={{ ...buttonStyle, marginLeft: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", boxSizing: "border-box", minWidth: `calc(${SOUND_LABEL_ARM.length + 1}ch + 26px)` }}
            aria-label={`Alert sound: ${soundEnabled ? "on" : "off"}`}
            aria-pressed={soundEnabled}
            onClick={() => { if (consumeArmingGesture() && soundEnabled) return; setLocalSoundOn(!soundEnabled); onToggleSound?.(); }}
          >
            <span data-provenance="assumed" data-source="ui:ops.sound">{soundEnabled ? armed ? "SOUND ON" : SOUND_LABEL_ARM : "SOUND OFF"}</span>
          </button>
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
      <div style={{ minHeight: "48px" }}><AlertStack
        key={session?.session_id}
        simTime={session?.clock.sim_time}
        raisedTimes={raisedTimes}
        alerts={alerts}
        onAcknowledge={(alertId) => {
          void issue({ kind: "ACK_ALERT", args: { alert_id: alertId } }).then((accepted) => {
            if (accepted) onAcknowledgeAlert?.(alertId);
          });
        }}
      /></div>
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
      {narrow && <nav data-slot="ops-side-drawer" aria-label="Ops panels" style={{ display: "flex", gap: "8px", padding: "8px 16px" }}>
        <button style={buttonStyle} aria-expanded={sideDrawer === "crew"} onClick={(event) => toggleSideDrawer("crew", event.currentTarget)}>Crew &amp; vehicles</button>
        <button style={buttonStyle} aria-expanded={sideDrawer === "mission"} onClick={(event) => toggleSideDrawer("mission", event.currentTarget)}>Conditions &amp; options</button>
      </nav>}
      <main style={bodyGridStyle}>
        {/* Left Column: CREW & VEHICLES */}
        <aside ref={crewPanelRef} tabIndex={-1} onKeyDown={(event) => { if (narrow && event.key === "Escape") { event.stopPropagation(); closeSideDrawer(); } }} aria-label="Crew and vehicles" style={{ ...columnStyle, ...(narrow ? { display: sideDrawer === "crew" ? "flex" : "none", position: "absolute", left: 0, top: 0, bottom: 0, width: "280px", zIndex: 5 } : {}) }}>
          {/* Module Label: CREW (04 P2) */}
          <div className="module-label" style={moduleLabelStyle}>
            [ HAB CORE /// CREW ]
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {crew.map((member) => {
              const isUnlinked = !member.linked || member.stale;
              // LOST = no hab link; STALE = linked but not heard recently (cached values). Not the same state.
              const linkWord = !member.linked ? "LOST" : member.stale ? "STALE" : "▮▮▮";
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
                        {linkWord} {PROVENANCE_GLYPHS.simulated}
                      </span>
                    </div>
                  </div>

                  {/* Task progress row (01 FR-50, U-53): counts only when the caller reduced them from the task list */}
                  <TaskProgress
                    crewId={member.crew_id}
                    stopCount={taskProgress[member.crew_id]?.stop ?? null}
                    total={taskProgress[member.crew_id]?.total ?? null}
                    onAdd={(cid) => setActiveAddCrew(cid)}
                    disabled={Boolean(warningKey) || !taskProgress[member.crew_id]?.stop?.stopId || atTaskLimit(member.crew_id)}
                    disabledReason={warningKey ? "Warning latched — acknowledge and clear before adding tasks" : atTaskLimit(member.crew_id) ? "Maximum 4 tasks reached for this crew at this stop" : !taskProgress[member.crew_id]?.stop?.stopId ? "No current or next planned stop" : undefined}
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
          {activeAddCrew && !warningKey && taskProgress[activeAddCrew as CrewId]?.stop?.stopId && (
            <div style={{ marginTop: "8px" }}>
              <AddTaskPopover
                sessionId={session?.session_id}
                planRevision={session?.plan_revision}
                crewId={activeAddCrew as CrewId}
                stopId={taskProgress[activeAddCrew as CrewId]!.stop!.stopId!}
                stopNo={taskProgress[activeAddCrew as CrewId]!.stop!.stopNo}
                tasks={activeSnapshot?.tasks}
                onAdd={(task) => {
                  // N-08 typed authoring fields; the Hab Core assigns task_id and origin.
                  void issue({ kind: "ADD_STOP_TASK", args: { ...task } }).then((accepted) => {
                    if (accepted) setActiveAddCrew(null);
                  });
                }}
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
                {v.kind === "utility_rover" && (
                  <>
                    <RoverQueue vehicle={v} compact />
                    <button
                      type="button"
                      style={buttonStyle}
                      aria-label={`Task rover ${v.vehicle_id}`}
                      aria-expanded={roverTask === v.vehicle_id}
                      onClick={(event) => openRoverTask(v.vehicle_id, event.currentTarget)}
                    >
                      TASK ROVER
                    </button>
                  </>
                )}
              </article>
            ))}
          </div>
        </aside>

        {/* Center Column: SHARED MAP SLOT */}
        <section
          className="ops-map-slot"
          data-picking={picking ? "true" : "false"}
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
          <div className="module-label" style={moduleLabelStyle}>
            [ TACTICAL MAP /// IAU_2015:49900 ]
          </div>

          <OpsMap
            snapshot={activeSnapshot ?? null}
            picking={picking}
            onPick={(target) => {
              setPickedTarget(target);
              setPicking(false);
            }}
          />

          {/* Option path preview (modelled, the Hab Core's path_preview) as an inset until the option is approved */}
          {preview && Array.isArray(preview.path_preview) && preview.path_preview.length > 0 && preview.path_preview.every((point) => point.length === 2 && point.every(Number.isFinite)) ? (() => {
            const points = preview.path_preview;
            const xs = points.map(([x]) => x);
            const ys = points.map(([, y]) => y);
            const width = Math.max(1, Math.max(...xs) - Math.min(...xs));
            const height = Math.max(1, Math.max(...ys) - Math.min(...ys));
            return <svg data-slot="option-path-preview" data-provenance="modelled" data-source={`snapshot:options/${preview.option_id}/path_preview`} role="img" aria-label="Option path preview in Mars projected metres" viewBox={`${Math.min(...xs) - width * 0.05} ${-Math.max(...ys) - height * 0.05} ${width * 1.1} ${height * 1.1}`} style={{ position: "absolute", left: "24px", bottom: "56px", zIndex: 3, width: "240px", height: "160px", backgroundColor: "var(--panel, #14181D)", border: "1px solid var(--edge, #5C6670)" }}>
              <polyline points={points.map(([x, y]) => `${x},${y}`).join(" ")} transform="scale(1,-1)" fill="none" stroke="var(--route)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>;
          })() : null}

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

        {/* SCR-15 rover tasking over the crew column, so the map stays free for the target pick (T29.04) */}
        {roverTask && (
          <div
            ref={roverPanelRef}
            tabIndex={-1}
            data-screen="SCR-15"
            role="dialog"
            aria-label={`Rover tasking ${roverTask}`}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                closeRoverTask();
              }
            }}
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "min(480px, 100%)", zIndex: 10, overflowY: "auto", backgroundColor: "var(--panel, #14181D)", borderRight: "1px solid var(--hairline, #2A313A)" }}
          >
            <RoverTask
              vehicleId={roverTask}
              client={client}
              selectedTarget={pickedTarget}
              onStartMapPlacement={() => {
                if (narrow) setSideDrawer(null);
                setPicking(true);
              }}
              onCancelMapPlacement={() => setPicking(false)}
              onClose={closeRoverTask}
            />
          </div>
        )}

        {/* Right Column: CONDITIONS, EARTH LINK, OPTIONS */}
        <aside onKeyDown={(event) => { if (narrow && event.key === "Escape") { event.stopPropagation(); closeSideDrawer(); } }} aria-label="Conditions and options" style={{ ...rightColumnStyle, ...(narrow ? { display: sideDrawer === "mission" ? "flex" : "none", position: "absolute", right: 0, top: 0, bottom: 0, width: "320px", zIndex: 5 } : {}) }}>
          <EarthLinkWidget snapshot={activeSnapshot} />
          {/* Module Label: CONDITIONS */}
          <div className="module-label" style={moduleLabelStyle}>
            [ ENVIRONMENT /// CONDITIONS ]
          </div>
          <ConditionsPanel variant="ops" conditions={conditions} showEarthLink={false} />

          {/* Module Label: OPTIONS (04 §D.3, §E.4) */}
          <div className="module-label" style={{ ...moduleLabelStyle, marginTop: "12px" }}>
            [ SAFETY /// OPTIONS ]
          </div>
          <div className="options-panel" ref={optionsRef} tabIndex={-1} role="region" aria-label="Options">
            <OptionsPanel
              client={client}
              snapshot={activeSnapshot}
              crewId={null}
              onPreviewPath={previewPath}
              onApproveOption={(opt) => onApproveOption?.(opt.option_id)}
            />
          </div>
        </aside>
      </main>

      {/* ------------------------------------- Bottom Bar: EVENT LOG (TASK-27)
          The strip shows the latest event; click, Enter or Space opens the full log as a drawer over the bottom of the
          console; Escape or the close button closes it and returns focus here (03 SCR-11, decided 11 Nov; 04 §E.4). */}
      <footer
        className="ops-event-log"
        style={{
          position: "relative",
          height: "36px",
          backgroundColor: "var(--panel, #14181D)",
          borderTop: "1px solid var(--hairline, #2A313A)",
        }}
        aria-label="Mission Event Log Stream"
        // Escape is handled here, on the strip and the drawer, and not on the document: another widget's Escape (the
        // add-task popover) is not ours to swallow.
        onKeyDown={(e) => {
          if (e.key === "Escape" && logOpen) closeLog();
        }}
      >
        <button
          ref={stripRef}
          type="button"
          data-slot="event-log-strip"
          aria-expanded={logOpen}
          aria-haspopup="dialog"
          aria-controls="ops-event-log-drawer"
          onClick={() => { setSideDrawer(null); setJoinOpen(false); setLogOpen((open) => !open); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            width: "100%",
            height: "100%",
            padding: "0 16px",
            background: "transparent",
            border: "none",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "12px",
            color: "var(--text-2, #A9B3BE)",
            overflowX: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--text-1, #ECEFF2)" }}>EVENT LOG {logOpen ? "▾" : "▴"}</span>
          {logLines.length === 0 ? (
            <span {...provAttrs(unavailableOf(null, "event_log"))}>{UNAVAILABLE}</span>
          ) : (
            logLines.map((line) => (
              <span key={line.key} {...provAttrs(line.prov ? { prov: line.prov, src: line.src } : unavailableOf(null, line.src))}>
                {line.text} {line.prov ? PROVENANCE_GLYPHS[line.prov] : ""}
              </span>
            ))
          )}
        </button>
        {logOpen && (
          <div
            id="ops-event-log-drawer"
            data-slot="event-log-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Event log"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeLog();
              } else if (event.key === "Tab") {
                const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
              }
            }}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "36px",
              zIndex: 20,
              backgroundColor: "var(--panel, #14181D)",
              borderTop: "2px solid var(--edge, #5C6670)",
              boxShadow: "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 8px" }}>
              <button
                ref={closeRef}
                type="button"
                data-slot="event-log-drawer-close"
                onClick={closeLog}
                style={{ ...buttonStyle, minHeight: "32px" }}
                aria-label="Close event log"
              >
                CLOSE ✕
              </button>
            </div>
            <EventLog client={client} maxHeight="40vh" />
          </div>
        )}
      </footer>
    </div>
  );
}
