/**
 * SCR-12 — EVA tablet (docs/specs/03 §B; layout in docs/specs/04 §E.5; mode OPS, 04 §B.2).
 * Purpose: Haven and O₂ first, next stop, mini-map, Summon / Abort with hold-to-confirm (04 §D.3), cached plan when unlinked.
 * Requirements: FR-32, FR-35, FR-39, FR-40, FR-44, FR-50, NFR-04, NFR-05.
 * Implemented by TASK-24 (T24.04, Ridita Alam).
 */

import {
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { CrewId, Snapshot, StopTask } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { useCommand, useHabClient, useLinkLost, useSnapshot } from "../../state/habSession";
import {
  havenTargetLabel,
  selectEvaViewModel,
  selectMetadataStrip,
  type EvaViewModel,
} from "../eva/viewModel";
import { EvaActionRow } from "../eva/HoldToConfirm";
import { StatusIcon } from "../components/statusIcon";
import {
  glyphOf,
  UNAVAILABLE,
  fmtBearing,
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
  /** Handler to open SCR-15 Rover tasking sheet. */
  onOpenRoverTasking?: () => void;
  /** Handler to open full-screen map mode. */
  onOpenFullScreenMap?: () => void;
  /** Orientation mode override. */
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
 * SCR-12 EVA Tablet Component (04 §E.5).
 * Fixed geography layout ensuring zero spatial displacement between normal, caution, and alert states.
 */
export function EvaTablet({
  client,
  crewId,
  snapshot,
  onOpenHud,
  onOpenOptions,
  onOpenRoverTasking,
  onOpenFullScreenMap,
  orientation = "portrait",
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
  const socketLost = useLinkLost(client).lost;
  const suitLinked = selectMetadataStrip(activeSnapshot, crewId).link.linked;
  const linked = socketLost ? false : suitLinked;
  const changes = useStopTaskChanges(send, serverTasks, linked);
  const viewSnapshot = activeSnapshot ? { ...activeSnapshot, tasks: changes.overlay(serverTasks) } : activeSnapshot;
  const vm: EvaViewModel = selectEvaViewModel(viewSnapshot, crewId);

  // Stop task list open state (TASKS button toggles the list).
  const [tasksExpanded, setTasksExpanded] = useState<boolean>(false);

  // FR-50: the list is in full only while the crew member is at the stop; walking, heading for a haven, sheltered (or
  // not out yet) and any unacknowledged warning or caution leave the count. U-59 (collapse rules) is still open.
  const alertCollapses = vm.alertSlot !== null && !vm.alertSlot.acknowledged && (vm.alertSlot.level === "warning" || vm.alertSlot.level === "caution");
  const collapsed = vm.activity !== "AT_STOP" || alertCollapses;
  const showTasksList = tasksExpanded;

  const isLandscape = orientation === "landscape";

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
    width: "100%",
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
      data-orientation={orientation}
      className={`scr12-eva-tablet ${className}`}
      style={rootStyle}
    >
      {/* ------------------------------------------------ Alert Slot (64 px) */}
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
              padding: "8px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <StatusIcon status={vm.alertSlot.level} showWord={true} />
              <span style={{ fontWeight: 700, fontSize: "var(--text-alert-eva, 22px)" }}>
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
              onClick={() => { void send({ kind: "ACK_ALERT", args: { alert_id: vm.alertSlot!.alertId } }); }}
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
          style={{
            ...cardStyle,
            minHeight: "96px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="micro" style={{ color: "var(--text-2, #A9B3BE)", fontSize: "16px" }}>
              NEXT {vm.nextStop ? `· ${vm.nextStop.stopName}` : `· ${UNAVAILABLE}`}
            </span>
            {/* TASKS button; counts are "—" until a stop is known (U-51 is still open) */}
            <TasksButton
              doneCount={vm.nextStop ? vm.nextStop.taskCount.done : null}
              totalCount={vm.nextStop ? vm.nextStop.taskCount.total : null}
              active={showTasksList}
              onClick={() => setTasksExpanded(!tasksExpanded)}
            />
          </div>

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
              ↗ {fmtBearing(vm.nextStop?.bearingDeg.v)}
            </span>
            <span>·</span>
            <span {...provAttrs(vm.nextStop?.distanceM ?? NO_STOP)}>
              {fmtKilometres(vm.nextStop?.distanceM.v)}
              {withUnit(vm.nextStop?.distanceM.v, "km")}
            </span>
            <span>·</span>
            <span {...provAttrs(vm.nextStop?.etaMinutes ?? NO_STOP)}>
              {fmtInt(vm.nextStop?.etaMinutes.v)}
              {withUnit(vm.nextStop?.etaMinutes.v, "min")}
            </span>
          </div>

          {/* Expanded Stop Tasks List (FR-50) */}
          {showTasksList && (
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
                stopId={vm.nextStop?.stopId ?? ""}
                readOnly={!hab || !crewId || (vm.alertSlot?.level === "warning" && vm.alertSlot.acknowledged)}
                undo={changes.undoTaskId === null ? null : { taskId: changes.undoTaskId }}
                collapsed={collapsed}
                notSyncedTaskIds={changes.notSyncedTaskIds()}
                rejections={changes.rejections()}
                onTick={(taskId) => changes.start(taskId, { state: "DONE" })}
                // UNDO is a reversal on the server ({state: "TODO", undo: true}); a bare TODO is never sent. While the link
                // is down it cancels a waiting change on the client instead.
                onUndo={(taskId) => changes.undo(taskId)}
                // SKIP only opens reason capture; the chosen reason sends the one SKIPPED change.
                onReason={(taskId, reason) => changes.start(taskId, { state: "SKIPPED", reason })}
              />
            </div>
          )}
        </div>

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="micro" style={{ color: "var(--text-2, #A9B3BE)", fontSize: "16px" }}>SURFACE MAP</span>
            <button
              id="action-open-full-map"
              type="button"
              className="btn"
              style={{
                minHeight: "56px",
                padding: "8px 14px",
                fontSize: "16px",
                cursor: "pointer",
              }}
              onClick={onOpenFullScreenMap}
            >
              FULL MAP
            </button>
          </div>
          {/* The map area is a real button (a large target for gloves), not a clickable div. */}
          <button
            type="button"
            data-slot="mini-map-open"
            aria-label="Open full-screen map"
            onClick={onOpenFullScreenMap}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              flex: 1,
              minHeight: "56px",
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px", color: "var(--text-3, #8592A0)" }}>
              [ Gale Crater · Mount Sharp Traverse · IAU_2015:49900 ]
            </span>
          </button>
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
        <span
          {...provAttrs(
            vm.metadata.link.bars === null
              ? unavailableOf("simulated", "crew.link_quality")
              : { prov: "simulated", src: "snapshot:crew.link_quality" },
          )}
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          LINK {vm.metadata.link.bars === null ? UNAVAILABLE : vm.metadata.link.bars}
          {vm.metadata.link.stale === true && (
            <span className="tag">
              <StatusIcon status="caution" word="STALE" showWord={true} />
            </span>
          )}
        </span>
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
          linked={linked}
          onOpenHud={onOpenHud}
          onOpenRoverTasking={onOpenRoverTasking}
        />
      </div>
    </div>
  );
}
