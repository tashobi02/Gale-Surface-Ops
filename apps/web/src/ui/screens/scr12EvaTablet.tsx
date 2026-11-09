/**
 * SCR-12 — EVA tablet (docs/specs/03 §B; layout in docs/specs/04 §E.5; mode OPS, 04 §B.2).
 * Purpose: Haven and O₂ first, next stop, mini-map, Summon / Abort with hold-to-confirm (04 §D.3), cached plan when unlinked.
 * Requirements: FR-32, FR-35, FR-39, FR-40, FR-44, FR-50, NFR-04, NFR-05.
 * Implemented by TASK-24 (T24.04, Ridita Alam).
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { CrewId, Snapshot, StopTaskReason } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import {
  selectEvaViewModel,
  type EvaViewModel,
} from "../eva/viewModel";
import { EvaActionRow } from "../eva/HoldToConfirm";
import { StatusIcon } from "../components/statusIcon";
import { StopTaskList } from "./scr12/StopTaskList";
import { TasksButton } from "./scr12/TasksButton";

export interface EvaTabletProps {
  /** Optional Hab Core WebSocket client. */
  client?: HabClient | null;
  /** Active crew identifier (defaults to "EV1"). */
  crewId?: CrewId;
  /** Direct Snapshot override (uses client.state() if omitted). */
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

const PROV_GLYPHS: Record<string, string> = {
  measured: "■",
  derived: "◆",
  modelled: "○",
  assumed: "△",
  replayed: "▶",
  simulated: "◇",
};

/** Format seconds into H:MM:SS or M:SS string. */
function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format minutes into H:MM string. */
function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * SCR-12 EVA Tablet Component (04 §E.5).
 * Fixed geography layout ensuring zero spatial displacement between normal, caution, and alert states.
 */
export function EvaTablet({
  client,
  crewId = "EV1",
  snapshot,
  onOpenHud,
  onOpenOptions,
  onOpenRoverTasking,
  onOpenFullScreenMap,
  orientation = "portrait",
  className = "",
}: EvaTabletProps): ReactElement {
  // Resolve active snapshot: prop override > client store > null
  const activeSnapshot = snapshot ?? client?.state() ?? null;
  const vm: EvaViewModel = selectEvaViewModel(activeSnapshot, crewId);

  // Stop task list open state (U-51 ratified: TASKS button toggles list)
  const [tasksExpanded, setTasksExpanded] = useState<boolean>(false);

  // Undo window & offline synced tracking for tasks (01 FR-50)
  const [undoTask, setUndoTask] = useState<{ taskId: string } | null>(null);
  const [notSyncedTaskIds, setNotSyncedTaskIds] = useState<string[]>([]);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const triggerUndoWindow = (taskId: string) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoTask({ taskId });
    undoTimerRef.current = setTimeout(() => {
      setUndoTask((cur) => (cur?.taskId === taskId ? null : cur));
    }, 5000);
  };

  const handleTaskTick = (taskId: string) => {
    triggerUndoWindow(taskId);
    if (client) {
      if (!vm.metadata.link.linked) {
        setNotSyncedTaskIds((prev) => Array.from(new Set([...prev, taskId])));
      }
      client
        .send({
          kind: "UPDATE_STOP_TASK",
          args: { task_id: taskId, state: "DONE" },
        })
        .then((res) => {
          if (res.ok) {
            setNotSyncedTaskIds((prev) => prev.filter((id) => id !== taskId));
          }
        })
        .catch(() => {});
    }
  };

  const handleTaskSkip = (taskId: string) => {
    triggerUndoWindow(taskId);
    if (client) {
      if (!vm.metadata.link.linked) {
        setNotSyncedTaskIds((prev) => Array.from(new Set([...prev, taskId])));
      }
      client
        .send({
          kind: "UPDATE_STOP_TASK",
          args: { task_id: taskId, state: "SKIPPED" },
        })
        .then((res) => {
          if (res.ok) {
            setNotSyncedTaskIds((prev) => prev.filter((id) => id !== taskId));
          }
        })
        .catch(() => {});
    }
  };

  const handleTaskReason = (taskId: string, reason: StopTaskReason) => {
    if (client) {
      client
        .send({
          kind: "UPDATE_STOP_TASK",
          args: { task_id: taskId, state: "SKIPPED", reason },
        })
        .catch(() => {});
    }
  };

  const handleTaskUndo = (taskId: string) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoTask(null);
    if (client) {
      client
        .send({
          kind: "UPDATE_STOP_TASK",
          args: { task_id: taskId, state: "TODO" },
        })
        .catch(() => {});
    }
  };

  // U-59 ratified: alert collapse rules — collapse during alert / options
  const isAlertActive = Boolean(vm.alertSlot && vm.alertSlot.level === "warning" && !vm.alertSlot.acknowledged);
  const showTasksList = tasksExpanded && !isAlertActive;

  // Next stop tasks
  const nextStopId = vm.nextStop?.stopId ?? activeSnapshot?.tasks?.[0]?.stop_id ?? "stop-1";
  const stopTasks = (activeSnapshot?.tasks ?? []).filter(
    (t) => t.stop_id === nextStopId && (t.crew_id === null || t.crew_id === crewId)
  );
  const doneCount = stopTasks.filter((t) => t.state === "DONE").length;
  const totalCount = stopTasks.length;

  const havenTargetLabel = vm.haven.targetId
    ? `via ${vm.haven.targetId}`
    : vm.haven.kind === "hab"
    ? "to Hab Airlock"
    : activeSnapshot?.vehicles?.[0]?.vehicle_id
    ? `via ${activeSnapshot.vehicles[0].vehicle_id}`
    : "—";

  const isLandscape = orientation === "landscape";

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
            data-provenance="simulated"
            data-src={vm.alertSlot.alertId}
            className={`alert-bar cut-s status-${vm.alertSlot.level}`}
            onClick={onOpenOptions}
            style={{
              width: "100%",
              minHeight: "64px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <StatusIcon status={vm.alertSlot.level} showWord={true} live={true} />
              <span
                data-provenance="simulated"
                data-src={vm.alertSlot.alertId}
                style={{ fontWeight: 700, fontSize: "var(--text-alert-eva, 22px)" }}
              >
                {vm.alertSlot.message}
              </span>
            </div>
            <button
              type="button"
              className="btn sm"
              style={{ minHeight: "56px", minWidth: "56px" }}
              aria-label="Review alert options"
            >
              OPTIONS
            </button>
          </div>
        ) : (
          <div
            data-slot="alert-nominal"
            data-provenance="derived"
            data-src="alerts/summary"
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
            }}
          >
            <StatusIcon status="nominal" showWord={true} live={true} />
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
            <span className="micro" style={{ color: "var(--text-2, #A9B3BE)" }}>HAVEN</span>
            <StatusIcon status={vm.haven.status} showWord={true} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", margin: "4px 0" }}>
            <span
              className="value"
              data-provenance={vm.haven.minutes.prov}
              data-src={vm.haven.minutes.src}
              style={valueMonoStyle}
            >
              {typeof vm.haven.minutes.v === "number" && Number.isFinite(vm.haven.minutes.v)
                ? Math.round(vm.haven.minutes.v)
                : "—"}
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px", textTransform: "uppercase" }}>
              {vm.haven.minutes.unit} {PROV_GLYPHS[vm.haven.minutes.prov] ?? "○"}
            </span>
          </div>
          <span
            data-provenance={vm.haven.minutes.prov}
            data-src={vm.haven.minutes.src}
            style={{ fontSize: "12px", color: "var(--text-2, #A9B3BE)", fontFamily: "var(--font-mono, monospace)" }}
          >
            {havenTargetLabel}
          </span>
        </div>

        {/* O2 card: immediately right on same row (04 §E.5) */}
        <div
          data-slot="o2"
          className={`card o2 cut-s status-${vm.o2.status}`}
          style={cardStyle}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="micro" style={{ color: "var(--text-2, #A9B3BE)" }}>O₂</span>
            <StatusIcon status={vm.o2.status} showWord={true} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", margin: "4px 0" }}>
            <span
              className="value"
              data-provenance={vm.o2.percent.prov}
              data-src={vm.o2.percent.src}
              style={valueMonoStyle}
            >
              {typeof vm.o2.percent.v === "number" && Number.isFinite(vm.o2.percent.v) ? vm.o2.percent.v : "—"}
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px" }}>
              % {PROV_GLYPHS[vm.o2.percent.prov] ?? "■"}
            </span>
          </div>
          <span
            data-provenance={vm.o2.timeLeftMinutes.prov}
            data-src={vm.o2.timeLeftMinutes.src}
            style={{ fontSize: "12px", color: "var(--text-2, #A9B3BE)", fontFamily: "var(--font-mono, monospace)" }}
          >
            {typeof vm.o2.timeLeftMinutes.v === "number" && Number.isFinite(vm.o2.timeLeftMinutes.v)
              ? `${formatMinutes(vm.o2.timeLeftMinutes.v)} left`
              : "— left"}{" "}
            {PROV_GLYPHS[vm.o2.timeLeftMinutes.prov] ?? "◆"}
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
            <span className="micro" style={{ color: "var(--text-2, #A9B3BE)" }}>
              NEXT {vm.nextStop ? `· ${vm.nextStop.stopName}` : "· In transit"}
            </span>
            <TasksButton
              doneCount={doneCount}
              totalCount={totalCount}
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
            <span
              data-provenance={vm.nextStop?.bearingDeg.prov ?? "derived"}
              data-src={vm.nextStop?.bearingDeg.src ?? "plan/bearing"}
            >
              ↗{" "}
              {vm.nextStop && typeof vm.nextStop.bearingDeg.v === "number"
                ? `${String(vm.nextStop.bearingDeg.v).padStart(3, "0")}°`
                : "---°"}
            </span>
            <span>·</span>
            <span
              data-provenance={vm.nextStop?.distanceM.prov ?? "derived"}
              data-src={vm.nextStop?.distanceM.src ?? "plan/distance"}
            >
              {vm.nextStop && typeof vm.nextStop.distanceM.v === "number"
                ? `${(vm.nextStop.distanceM.v / 1000).toFixed(2)} km`
                : "— km"}
            </span>
            <span>·</span>
            <span
              data-provenance={vm.nextStop?.etaMinutes.prov ?? "derived"}
              data-src={vm.nextStop?.etaMinutes.src ?? "plan/eta"}
            >
              {vm.nextStop && typeof vm.nextStop.etaMinutes.v === "number"
                ? `${vm.nextStop.etaMinutes.v} min`
                : "— min"}
            </span>
          </div>

          {/* Expanded Stop Tasks List (01 FR-50, 04 §E.5, T31.05) */}
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
                tasks={activeSnapshot?.tasks ?? []}
                crewId={crewId}
                stopId={nextStopId}
                readOnly={false}
                undo={undoTask}
                collapsed={false}
                notSyncedTaskIds={notSyncedTaskIds}
                onTick={handleTaskTick}
                onSkip={handleTaskSkip}
                onUndo={handleTaskUndo}
                onReason={handleTaskReason}
              />
            </div>
          )}
        </div>

        {/* Mini-map Card (04 §E.5, TASK-07 planner lane) */}
        <div
          data-slot="mini-map"
          className="card mini-map cut-s"
          onClick={onOpenFullScreenMap}
          style={{
            ...cardStyle,
            minHeight: "160px",
            position: "relative",
            cursor: "pointer",
            justifyContent: "space-between",
            background: "#080A0D",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="micro" style={{ color: "var(--text-2, #A9B3BE)" }}>SURFACE MAP</span>
            <button
              id="action-open-full-map"
              type="button"
              className="btn"
              style={{
                minHeight: "56px",
                padding: "8px 14px",
                fontSize: "12px",
                cursor: "pointer",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenFullScreenMap?.();
              }}
            >
              FULL MAP
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "12px", color: "var(--text-3, #8592A0)" }}>
              TODO(TASK-07): Mini-map (planner lane)
            </span>
          </div>
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
          fontSize: "var(--text-micro, 12px)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-2, #A9B3BE)",
          padding: "0 4px",
          borderTop: "1px solid var(--hairline, #2A313A)",
        }}
      >
        <span
          data-provenance={vm.metadata.evaTimeSeconds.prov}
          data-src={vm.metadata.evaTimeSeconds.src}
        >
          {typeof vm.metadata.evaTimeSeconds.v === "number"
            ? `EVA ${formatDuration(vm.metadata.evaTimeSeconds.v)}`
            : "EVA —"}
        </span>
        <span>·</span>
        <span
          data-provenance={vm.metadata.doseUgy.prov}
          data-src={vm.metadata.doseUgy.src}
        >
          {typeof vm.metadata.doseUgy.v === "number"
            ? `DOSE ${(vm.metadata.doseUgy.v / 1000).toFixed(1)} mGy`
            : "DOSE — mGy"}
        </span>
        <span>·</span>
        <span
          data-provenance="derived"
          data-src="net/link"
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          LINK {vm.metadata.link.linked ? "▮▮▮" : "▯▯▯"}
          {vm.metadata.link.stale && <span className="tag" style={{ color: "var(--status-caution, #FFB020)" }}>STALE</span>}
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
          client={client}
          linked={vm.metadata.link.linked}
          crewId={crewId}
          onOpenHud={onOpenHud}
          onOpenRoverTasking={onOpenRoverTasking}
        />
      </div>
    </div>
  );
}
