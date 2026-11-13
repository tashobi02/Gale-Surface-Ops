/**
 * SCR-12 — EVA tablet (docs/specs/03 §B; layout in docs/specs/04 §E.5; mode OPS, 04 §B.2).
 * Purpose: Haven and O₂ first, next stop, mini-map, Summon / Abort with hold-to-confirm (04 §D.3), cached plan when unlinked.
 * Requirements: FR-32, FR-35, FR-39, FR-40, FR-44, FR-50, NFR-04, NFR-05.
 * Implemented by TASK-24 (T24.04, Ridita Alam).
 */

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { CrewId, Snapshot, StopTask } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { useCommand, useHabClient, useSocketConnected, useSnapshot, useTransportLost } from "../../state/habSession";
import {
  havenTargetLabel,
  selectEvaViewModel,
  selectMetadataStrip,
  type EvaViewModel,
} from "../eva/viewModel";
import { logLiveFallback } from "../live/fallbackDebug";
import { MiniMap } from "../eva/MiniMap";
import "./scr12EvaTablet.css";
import { EvaActionRow } from "../eva/HoldToConfirm";
import { StatusIcon } from "../components/statusIcon";
import {
  glyphOf,
  UNAVAILABLE,
  fmtBearing,
  fmtBearingArrow,
  fmtDuration,
  fmtFixed,
  fmtHourMinute,
  fmtInt,
  fmtKilometres,
  isFiniteNumber,
  provAttrs,
  unavailableOf,
} from "../components/provenance";
import { TasksButton } from "./scr12/TasksButton";
import { CrewMotionButton } from "./scr12/CrewMotionButton";
import { GoByRover, selectRide } from "./scr12/GoByRover";
import { StopTaskList } from "./scr12/StopTaskList";
import { useStopTaskChanges } from "./scr12/useStopTaskChanges";

export interface EvaTabletProps {
  /** Hab Core WebSocket client; omitted means the tab's session (state/habSession.ts), null means none. */
  client?: HabClient | null;
  /** The crew member this tablet belongs to. Required: there is no default crew member. */
  crewId: CrewId;
  /** Direct Snapshot override (uses the session's snapshot if omitted). */
  snapshot?: Snapshot | null;
  /** Handler to open SCR-13 HUD visor glance. */
  onOpenHud?: () => void;
  /** Handler to open SCR-14 Options sheet. */
  onOpenOptions?: () => void;
  optionsOpen?: boolean;
  contrast?: boolean;
  onContrastChange?: (value: boolean) => void;
  /** Handler to open SCR-15 Rover tasking sheet. */
  onOpenRoverTasking?: () => void;
  /** Handler to open full-screen map mode. */
  onOpenFullScreenMap?: () => void;
  /** Orientation mode override; omitted follows the viewport, as the stylesheet's media query does. */
  orientation?: "portrait" | "landscape";
  className?: string;
}

const NO_TASKS: StopTask[] = [];

/** A "—" shown where there is no stop to navigate to: flagged unavailable, class unknown (04 §D.1). */
const NO_STOP = unavailableOf(null, "next_stop");

/** Unit suffix only for a real number, so "—" never reads "— min". */
function withUnit(v: unknown, unit: string): string {
  return isFiniteNumber(v) ? ` ${unit}` : "";
}

/**
 * The ETA in minutes: "<1 min" under a minute, so a value between 0 and 1 is never rounded to "0 min" (which reads as
 * "no time left"). "—" when the Hab Core has not supplied one.
 */
function fmtEta(minutes: unknown): string {
  if (!isFiniteNumber(minutes)) return UNAVAILABLE;
  if (minutes < 1) return "<1 min";
  return `${Math.round(minutes)} min`;
}

/** The hop count's unit in words: "1 hop" is singular, every other count is "hops". */
function hopsUnit(count: unknown): string {
  return count === 1 ? "hop" : "hops";
}

/**
 * The orientation of the tablet, read from the SAME media query the stylesheet uses (`@media (orientation: ...)`),
 * so `data-orientation` and the layout can never disagree. The `orientation` prop overrides it for a caller that
 * pins the tablet to one orientation; without it the viewport decides, as the CSS does.
 */
function useViewportOrientation(override?: "portrait" | "landscape"): "portrait" | "landscape" {
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(() => {
    if (override) return override;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "portrait";
    return window.matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait";
  });
  useEffect(() => {
    if (override) {
      setOrientation(override);
      return;
    }
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(orientation: landscape)");
    const apply = (): void => setOrientation(query.matches ? "landscape" : "portrait");
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [override]);
  return override ?? orientation;
}

/**
 * SCR-12 EVA Tablet Component (04 §E.5).
 * Fixed geography layout ensuring zero spatial displacement between normal, caution, and alert states.
 */
export function EvaTablet({
  client,
  crewId,
  snapshot,
  onOpenHud,
  onOpenOptions,
  optionsOpen = false,
  contrast: controlledContrast,
  onContrastChange,
  onOpenRoverTasking,
  onOpenFullScreenMap,
  orientation,
  className = "",
}: EvaTabletProps): ReactElement {
  // Resolve the snapshot: prop override > the session store (re-renders on every change) > null.
  const hab = useHabClient(client);
  const stored = useSnapshot(client);
  const send = useCommand(client);
  const activeSnapshot = snapshot ?? stored;

  // A tick or skip is sent at once and shown at once (01 FR-50), so the view model, the TASKS count and the list all
  // read the snapshot with the changes in progress applied.
  const serverTasks = activeSnapshot?.tasks ?? NO_TASKS;
  // Linked means the suit link is up (snapshot) and this tablet's own socket to the Hab Core is not lost.
  const socketLost = !useSocketConnected(client);
  // The transport itself went down (the socket was up and closed). The simulated suit link is a separate thing and
  // is read from the snapshot, so the two are never confused.
  const transportLost = useTransportLost(client);
  const suitLinked = selectMetadataStrip(activeSnapshot, crewId).link.linked;
  const linked = socketLost ? false : suitLinked;
  const changes = useStopTaskChanges(send, serverTasks, linked);
  const [rideRejection, setRideRejection] = useState<string | null>(null);
  const viewSnapshot = activeSnapshot ? { ...activeSnapshot, tasks: changes.overlay(serverTasks) } : activeSnapshot;
  const vm: EvaViewModel = selectEvaViewModel(viewSnapshot, crewId);
  // FR-50: at a stop the task list belongs to the stop underfoot. NEXT navigation still points ahead (FD-266).
  const member = viewSnapshot?.crew.find((c) => c.crew_id === crewId);
  const index = member?.stop_index;
  const currentStop = member?.activity === "AT_STOP" && Number.isInteger(index) && index! >= 1
    ? viewSnapshot?.plan?.waypoints.filter((w) => w.role === "stop")[index! - 1] : undefined;
  const taskStopId = currentStop?.id ?? vm.nextStop?.stopId;
  const atTasks = viewSnapshot?.tasks.filter((t) => t.stop_id === taskStopId && (t.crew_id === null || t.crew_id === crewId)) ?? NO_TASKS;
  const taskCount = taskStopId ? { done: atTasks.filter((t) => t.state === "DONE").length, total: atTasks.length } : null;

  // Stop task list open state (TASKS button toggles the list).
  const [localContrast, setLocalContrast] = useState(false);
  const contrast = controlledContrast ?? localContrast;
  const setContrast = onContrastChange ?? setLocalContrast;
  const [mapUnavailable, setMapUnavailable] = useState(false);
  // The mini-map is unmounted once it has failed (FD-500), so a failed attempt cannot recover on its own. The attempt
  // counter remounts it, and the retry control below lets the crew ask for another attempt: a transient failure (a
  // tile that was lost on a busy LAN) must not cost the map for the rest of the session.
  const [mapAttempt, setMapAttempt] = useState(0);
  const [tapFallback, setTapFallback] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState<boolean>(false);
  // The Hab Core's reason for a refused ACK_ALERT, shown under the alert bar until the next alert (04 §D.5).
  const [ackRejection, setAckRejection] = useState<string | null>(null);

  // FR-50: the list is in full only while the crew member is at the stop; walking, heading for a haven, sheltered (or
  // not out yet) and any unacknowledged warning or caution leave the count.
  const alertCollapses = vm.alertSlot !== null && !vm.alertSlot.acknowledged && (vm.alertSlot.level === "warning" || vm.alertSlot.level === "caution");
  const collapsed = vm.activity !== "AT_STOP" || alertCollapses || optionsOpen;
  const showTasksList = tasksExpanded;

  // The orientation follows the viewport (the same media query the stylesheet uses) unless a caller pins it.
  const resolvedOrientation = useViewportOrientation(orientation);
  const isLandscape = resolvedOrientation === "landscape";

  // With no alert the banner reads NOMINAL only when this crew member's HAVEN and O₂ are both available; if either is
  // unknown it is UNKNOWN, matching the cards (04 §C.1: never a nominal default).
  const bannerStatus = vm.haven.status === "unknown" || vm.o2.status === "unknown" ? "unknown" : "nominal";

  // Root container styles (OPS dark instrument mode, 04 §B.2)
  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minHeight: "100%",
    boxSizing: "border-box",
    background: "var(--surface-0, #0B0D10)",
    color: "var(--fg-1, #ECEFF2)",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    padding: "8px 12px",
    gap: "8px",
    position: "relative",
  };

  // Fixed 64px Alert slot (04 §E.5: "ALERT BAR (when present) fixed, 64 px")
  const alertSlotStyle: CSSProperties = {
    minHeight: "64px",
    // Shortened from the right so the crew-motion control fits beside it (QoL Q2).
    flex: "1 1 0",
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    boxSizing: "border-box",
  };

  // Telemetry row (HAVEN always top-left, O2 immediately right)
  const telemetryRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    width: "100%",
  };

  const cardStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    padding: "10px 12px",
    background: "var(--surface-1, #14181D)",
    border: "1px solid var(--control-edge, #5C6670)",
    boxSizing: "border-box",
    minHeight: "56px",
  };

  const valueMonoStyle: CSSProperties = {
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "var(--text-value-eva, 56px)",
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums slashed-zero",
  };

  return (
    <div
      role="main"
      aria-label="EVA Tablet Operations"
      data-screen="SCR-12"
      data-surface="eva"
      data-mode="ops"
      data-orientation={resolvedOrientation}
      data-contrast={contrast ? "high" : "normal"}
      data-tasks-open={showTasksList ? "true" : "false"}
      className={`scr12-eva-tablet ${className}`}
      style={rootStyle}
    >
      {/* ------------------------------------------------ Top bar: alert slot (64 px) and the crew-motion control (top right) */}
      <div data-slot="top-bar" style={{ display: "flex", alignItems: "flex-start", gap: "8px", width: "100%" }}>
      <div
        role="region"
        aria-label="Alert banner"
        data-slot="alert-slot"
        style={alertSlotStyle}
        className="alert-bar-slot"
      >
        {vm.alertSlot ? (
          <div
            role="alert"
            data-slot="alert"
            data-level={vm.alertSlot.level}
            className={`alert-bar cut-s status-${vm.alertSlot.level}`}
            style={{
              width: "100%",
              minHeight: "64px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "8px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: "1 1 auto" }}>
              <StatusIcon status={vm.alertSlot.level} showWord={true} />
              <span style={{ fontWeight: 700, fontSize: "var(--text-alert-eva, 22px)", overflow: "hidden", textOverflow: "ellipsis" }} title={vm.alertSlot.message}>
                {vm.alertSlot.message}
              </span>
            </div>
            <button
              type="button"
              className="btn sm"
              style={{ minHeight: "56px", minWidth: "56px", fontSize: "16px", cursor: "pointer" }}
              aria-label="Review alert options"
              onClick={onOpenOptions}
            >
              OPTIONS
            </button>
            {!vm.alertSlot.acknowledged && <button
              type="button"
              className="btn sm"
              style={{ minHeight: "56px", minWidth: "56px", fontSize: "16px", cursor: "pointer" }}
              aria-label="Acknowledge alert"
              onClick={() => {
                // The Hab Core's reason for a refused ACK is shown, not swallowed (04 §D.5).
                void send({ kind: "ACK_ALERT", args: { alert_id: vm.alertSlot!.alertId } }).then((result) => {
                  setAckRejection(result.ok ? null : (result.message ?? "The Hab Core refused the acknowledgement"));
                });
              }}
            >
              ACK
            </button>}
          </div>
        ) : (
          <div
            data-slot="alert-nominal"
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
            }}
          >
            <StatusIcon status={bannerStatus} showWord={true} />
          </div>
        )}
      </div>
      <CrewMotionButton crewId={crewId} activity={vm.activity} send={send} />
      </div>

      {/* The transport to the Hab Core went down. This is not the simulated suit link: `linked: false` in the
          snapshot is the suit's own radio, and the tablet still receives the Hab Core over a working socket. A closed
          socket is known the moment it closes, so this notice comes at once, before the 3-second watchdog raises
          SCR-18 (FR-32) for a half-open socket that merely stops answering.

          It is a strip, not an overlay: an active safety alert and its ACK control stay visible and usable while it
          is up (a crew member must be able to acknowledge a radiation alert with the transport down). It carries no
          number of its own, so it needs no provenance; the values behind it are the last ones received. */}
      {transportLost && (
        <div
          role="status"
          data-slot="transport-lost-notice"
          data-fallback="transport-lost"
          data-status="caution"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            borderLeft: "4px solid var(--status-caution, #FFB020)",
            background: "var(--caution-fill, #FFB020)",
            color: "#000000",
            fontWeight: 700,
            fontSize: "16px",
          }}
        >
          <StatusIcon status="caution" showWord={true} />
          <span>HAB TRANSPORT LOST — VALUES BELOW ARE THE LAST ONES RECEIVED</span>
        </div>
      )}

      {/* A refused ACK_ALERT says so, with the Hab Core's own reason (04 §D.5): a command that failed must not look
          like one that worked. */}
      {ackRejection !== null && (
        <div
          role="status"
          data-slot="ack-rejection"
          data-status="warning"
          data-provenance="simulated"
          data-source="snapshot:alerts"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "16px",
            color: "var(--text-1, #ECEFF2)",
            borderLeft: "4px solid var(--status-warning, #FF6B6B)",
            paddingLeft: "8px",
          }}
        >
          <StatusIcon status="warning" showWord={true} />
          <span>ACK REFUSED — {ackRejection}</span>
        </div>
      )}

      {/* -------------------------------------- Telemetry Row: HAVEN & O2 */}
      <div
        role="region"
        aria-label="Critical life support telemetry"
        data-slot="telemetry-row"
        style={telemetryRowStyle}
      >
        {/* HAVEN card: ALWAYS top-left (04 §A.3 #4) */}
        <div
          data-slot="haven"
          className={`card haven cut-s status-${vm.haven.status}`}
          style={cardStyle}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="micro" style={{ color: "var(--text-2, #A9B3BE)", fontSize: "16px" }}>HAVEN</span>
            <StatusIcon status={vm.haven.status} showWord={true} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", margin: "4px 0" }}>
            <span
              className="value"
              {...provAttrs(vm.haven.minutes)}
              style={valueMonoStyle}
            >
              {fmtInt(vm.haven.minutes.v)}
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px", textTransform: "uppercase" }}>
              {vm.haven.minutes.unit} {glyphOf(vm.haven.minutes)}
            </span>
          </div>
          <span style={{ fontSize: "16px", color: "var(--text-2, #A9B3BE)", fontFamily: "var(--font-mono, monospace)" }}>
            {havenTargetLabel(vm.haven)}
          </span>
          {linked === false && <span {...provAttrs(vm.metadata.link.ageSeconds === null
            ? unavailableOf("derived", "crew.last_linked_sim_time")
            : { prov: "derived", src: "snapshot:sim_time+crew.last_linked_sim_time" })}>
            STALE {fmtDuration(vm.metadata.link.ageSeconds)}
          </span>}
        </div>

        {/* O2 card: immediately right on same row (04 §E.5) */}
        <div
          data-slot="o2"
          className={`card o2 cut-s status-${vm.o2.status}`}
          style={cardStyle}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="micro" style={{ color: "var(--text-2, #A9B3BE)", fontSize: "16px" }}>O₂</span>
            <StatusIcon status={vm.o2.status} showWord={true} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", margin: "4px 0" }}>
            <span
              className="value"
              {...provAttrs(vm.o2.percent)}
              style={valueMonoStyle}
            >
              {vm.o2.percent.v}
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px" }}>
              {vm.o2.percent.unit} {glyphOf(vm.o2.percent)}
            </span>
          </div>
          <span
            {...provAttrs(vm.o2.timeLeftMinutes)}
            style={{ fontSize: "16px", color: "var(--text-2, #A9B3BE)", fontFamily: "var(--font-mono, monospace)" }}
          >
            {fmtHourMinute(vm.o2.timeLeftMinutes.v)} left {glyphOf(vm.o2.timeLeftMinutes)}
          </span>
        </div>
      </div>

      {/* ------------------------------------- Body layout: NEXT & Map */}
      <div
        role="region"
        aria-label="Navigation and tasks"
        style={{
          display: isLandscape ? "grid" : "flex",
          gridTemplateColumns: isLandscape ? "1fr 1fr" : undefined,
          flexDirection: isLandscape ? undefined : "column",
          gap: "8px",
          flex: 1,
        }}
      >
        {/* NEXT Card / Task List (04 §E.5, FR-50) */}
        <div
          data-slot="next"
          className="card next cut-s"
          /* The NEXT card scrolls in the landscape and portrait grids (`overflow: auto`), so its task list can be
             read without scrolling the whole tablet. A region that scrolls but cannot be focused is unreachable by
             keyboard: a crew member who cannot use a mouse could not scroll it, so anything below the fold would be
             invisible to them. `tabIndex` makes the region a focus stop and the browser scrolls it into view when it
             takes focus; the label says what the focus landed on. The axe rule `scrollable-region-focusable` caught
             this on 6 of the 8 viewports. */
          tabIndex={0}
          aria-label="Next task"
          style={{
            ...cardStyle,
            minHeight: "96px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="micro" style={{ color: "var(--text-2, #A9B3BE)", fontSize: "16px" }}>
              NEXT {vm.nextStop ? <>· <span data-identifier>{vm.nextStop.stopName}</span></> : `· ${UNAVAILABLE}`}
            </span>
            {/* TASKS button; counts are "—" until a stop is known. While the list is collapsed the count stays here as a
                figure, not a control, and no panel is behind it (FD-032). */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* GO BY ROVER (QoL Q3): the pressurized rover carries this crew member to the next stop. */}
            <GoByRover
              ride={selectRide(activeSnapshot, crewId)}
              onGo={({ vehicleId, stopId }) => {
                void send({ kind: "RIDE_VEHICLE", args: { crew_id: crewId, vehicle_id: vehicleId, to_stop_id: stopId } }).then((result) => {
                  setRideRejection(result.ok ? null : (result.message ?? "The Hab Core refused the ride"));
                });
              }}
            />
            <TasksButton
              doneCount={taskCount?.done ?? null}
              totalCount={taskCount?.total ?? null}
              active={showTasksList}
              readOnly={collapsed}
              onClick={() => setTasksExpanded(!tasksExpanded)}
            />
            </div>
          </div>
          {rideRejection && (
            <div role="alert" data-slot="ride-rejection" style={{ fontSize: "16px", marginTop: "4px" }}>
              {rideRejection}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginTop: "8px",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "16px",
            }}
          >
            <span {...provAttrs(vm.nextStop?.bearingDeg ?? NO_STOP)}>
              {fmtBearingArrow(vm.nextStop?.bearingDeg.v)} {fmtBearing(vm.nextStop?.bearingDeg.v)}
            </span>
            <span>·</span>
            <span {...provAttrs(vm.nextStop?.distanceM ?? NO_STOP)}>
              {fmtKilometres(vm.nextStop?.distanceM.v)}
              {withUnit(vm.nextStop?.distanceM.v, "km")}
            </span>
            <span>·</span>
            <span {...provAttrs(vm.nextStop?.etaMinutes ?? NO_STOP)}>
              {fmtEta(vm.nextStop?.etaMinutes.v)}
            </span>
          </div>

        </div>

          {/* Expanded Stop Tasks List (FR-50). While the list is collapsed (walking, an unacknowledged warning or the
              options sheet open) FD-032 wants a count and nothing else: no panel, so nothing covers the NEXT card's
              bearing, distance and ETA. The count itself stays in the NEXT header, on the TASKS button. */}
          {showTasksList && !collapsed && (
            <div
              data-slot="stop-task-list"
              style={{
                marginTop: "12px",
                borderTop: "1px solid var(--hairline, #2A313A)",
                paddingTop: "8px",
              }}
            >
              <StopTaskList
                tasks={viewSnapshot?.tasks ?? []}
                crewId={crewId}
                stopId={taskStopId ?? ""}
                readOnly={!hab || !crewId || (vm.alertSlot?.level === "warning" && vm.alertSlot.acknowledged)}
                undo={changes.undoTaskId === null ? null : { taskId: changes.undoTaskId }}
                collapsed={false}
                notSyncedTaskIds={changes.notSyncedTaskIds()}
                rejections={changes.rejections()}
                onTick={(taskId) => changes.start(taskId, { state: "DONE" })}
                // UNDO is a reversal on the server ({state: "TODO", undo: true}); a bare TODO is never sent. While the link
                // is down it cancels a waiting change on the client instead.
                onUndo={(taskId) => changes.undo(taskId)}
                // SKIP records other immediately; the REASON control in the undo strip revises it (FD-028).
                onReason={(taskId, reason) => changes.start(taskId, { state: "SKIPPED", reason })}
                onChangeReason={(taskId, reason) => changes.changeReason(taskId, reason)}
              />
            </div>
          )}

        {/* Mini-map Card (04 §E.5) */}
        <div
          data-slot="mini-map"
          className="card mini-map cut-s"
          style={{
            ...cardStyle,
            minHeight: "160px",
            position: "relative",
            justifyContent: "space-between",
            background: "#080A0D",
          }}
        >
          {mapUnavailable ? <div role="status" data-fallback="hud-only">
            <StatusIcon status="unknown" showWord />
            <span data-provenance="measured" data-source="unavailable:site.map" data-unavailable="true">Map unavailable — HUD only. Use HAVEN and NEXT above; abort and acknowledge remain available.</span>
            <button
              type="button"
              data-slot="map-retry"
              onClick={() => { setMapUnavailable(false); setMapAttempt((n) => n + 1); }}
              style={{ minHeight: "44px", padding: "4px 12px", border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit" }}
            >
              RETRY MAP
            </button>
          </div> : <MiniMap key={mapAttempt} snapshot={activeSnapshot ?? null} crewId={crewId} onOpen={onOpenFullScreenMap} onUnavailable={() => { setMapUnavailable(true); logLiveFallback("hud-only"); }} />}
        </div>
      </div>

      {/* ------------------------------------- Metadata Strip (24 px) */}
      <div
        role="region"
        aria-label="Mission metadata"
        data-slot="meta-strip"
        className="meta-strip"
        style={{
          minHeight: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
          fontSize: "16px",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-2, #A9B3BE)",
          padding: "0 4px",
          borderTop: "1px solid var(--hairline, #2A313A)",
        }}
      >
        <span {...provAttrs(vm.metadata.evaTimeSeconds)}>
          EVA {fmtDuration(vm.metadata.evaTimeSeconds.v)} {glyphOf(vm.metadata.evaTimeSeconds)}
        </span>
        <span>·</span>
        <span {...provAttrs(vm.metadata.doseUgy)}>
          DOSE {isFiniteNumber(vm.metadata.doseUgy.v) ? fmtFixed(vm.metadata.doseUgy.v / 1000, 1) : UNAVAILABLE} mGy{" "}
          {glyphOf(vm.metadata.doseUgy)}
        </span>
        <span>·</span>
        {changes.notSyncedTaskIds().length > 0 ? <span data-provenance="simulated" data-source="snapshot:tasks">NOT SYNCED</span> : <span
          {...provAttrs(
            vm.metadata.link.hops.unavailable
              ? unavailableOf("simulated", "crew.link_hops")
              : { prov: vm.metadata.link.hops.prov ?? "simulated", src: vm.metadata.link.hops.src },
          )}
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          LINK {vm.metadata.link.hops.v}
          {vm.metadata.link.hops.v !== UNAVAILABLE && ` ${hopsUnit(vm.metadata.link.hops.v)}`}
          {" "}
          <span {...provAttrs(vm.metadata.link.via)}>VIA {vm.metadata.link.via.v}</span>
          {vm.metadata.link.stale === true && (
            <span className="tag">
              <StatusIcon status="caution" word="STALE" showWord={true} />
            </span>
          )}
        </span>}
      </div>

      {/* ------------------------------------- Action Row (56–72 px) */}
      <div
        role="region"
        aria-label="EVA controls"
        data-slot="action-row"
        style={{
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <EvaActionRow
          client={hab}
          crewId={crewId}
          contrast={contrast}
          tapFallback={tapFallback}
          onContrast={() => setContrast(!contrast)}
          onTapFallback={() => setTapFallback((value) => !value)}
          linked={linked}
          onOpenHud={onOpenHud}
          onOpenRoverTasking={onOpenRoverTasking}
        />
      </div>
    </div>
  );
}
