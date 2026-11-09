/**
 * StopTaskList — Stop task list on the EVA tablet (01 FR-50, 04 §E.5, Mockup handoff G-30–G-34, G-40).
 * Implementation: T31.05 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Rules:
 * - Up to four rows of ≥ 56 px (04 §C.3 touch target).
 * - Neutral chrome only: no status colours (red, yellow, green) on task rows (04 §A.3 #1).
 * - States with glyph + word:
 *     TODO: empty square + "TODO"
 *     DONE: drawn check in square (never filled ■, G-32) + "DONE"
 *     SKIPPED: ⊘ + "SKIPPED"
 *     DROPPED: ⊘ + "DROPPED"
 * - One tap ticks DONE; SKIP opens reason capture (time, terrain, alert, other). Skipping sends exactly one
 *   command, after the reason is chosen (onReason); the SKIP tap itself sends nothing.
 * - 5-s undo window shows UNDO button.
 * - Unsynced state shows "not synced" indicator.
 * - Ops-added task displays "added by ops" tag.
 * - During alert or walking, collapses to a count (TASKS n/m).
 * - Read-only mode renders without interactive controls.
 */

import { useState, type CSSProperties, type ReactElement } from "react";
import type { CrewId, StopTask, StopTaskReason } from "@marswalk/protocol";

export interface StopTaskListProps {
  tasks: StopTask[];
  crewId: CrewId;
  stopId: string;
  readOnly: boolean;
  undo: { taskId: string } | null;
  collapsed: boolean;
  notSyncedTaskIds: string[];
  onTick: (taskId: string) => void;
  /** Notification only: fired when SKIP opens reason capture. It must not send a command; `onReason` does (once). */
  onSkip?: (taskId: string) => void;
  onUndo: (taskId: string) => void;
  onReason: (taskId: string, reason: StopTaskReason) => void;
  className?: string;
}

export interface StopTaskRowProps {
  task: StopTask;
  readOnly: boolean;
  inUndoWindow: boolean;
  notSynced: boolean;
  onTick: (taskId: string) => void;
  /** Notification only: fired when SKIP opens reason capture. It must not send a command. */
  onSkip?: (taskId: string) => void;
  onUndo: (taskId: string) => void;
  onReason?: (taskId: string, reason: StopTaskReason) => void;
  className?: string;
}

/** Task states come from the simulated session (FR-50); counts are reduced from the supplied task list. */
const COUNT_ATTRS = {
  "data-provenance": "simulated",
  "data-source": "snapshot:tasks",
  title: "snapshot:tasks",
} as const;

const REASONS: StopTaskReason[] = ["time", "terrain", "alert", "other"];

export function StopTaskRow({
  task,
  readOnly,
  inUndoWindow,
  notSynced,
  onTick,
  onSkip,
  onUndo,
  onReason,
  className = "",
}: StopTaskRowProps): ReactElement {
  const [showReasonPicker, setShowReasonPicker] = useState(false);

  const rowStyle: CSSProperties = {
    minHeight: "var(--target-eva, 56px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    backgroundColor: "var(--raised, #1C2128)",
    borderBottom: "1px solid var(--hairline, #2A313A)",
    gap: "12px",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "16px", // EVA minimum text size (04 §A.3 #9)
    color: "var(--text-1, #ECEFF2)",
  };

  const actionButtonStyle: CSSProperties = {
    minHeight: "var(--target-eva, 56px)",
    minWidth: "var(--target-eva, 56px)",
    padding: "6px 12px",
    backgroundColor: "var(--panel, #14181D)",
    border: "1px solid var(--edge, #5C6670)",
    color: "var(--text-1, #ECEFF2)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
    fontSize: "16px",
    fontWeight: 600,
    textTransform: "uppercase",
  };

  const checkboxStyle: CSSProperties = {
    width: "24px",
    height: "24px",
    border: "1px solid var(--edge, #5C6670)",
    backgroundColor: "var(--panel, #14181D)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    lineHeight: "1",
    color: "var(--text-1, #ECEFF2)",
  };

  // SKIP only opens reason capture; the single UPDATE_STOP_TASK is sent by handleReasonSelect.
  const handleSkipClick = (): void => {
    setShowReasonPicker(true);
    onSkip?.(task.task_id);
  };

  const handleReasonSelect = (reason: StopTaskReason): void => {
    setShowReasonPicker(false);
    onReason?.(task.task_id, reason);
  };

  return (
    <div
      className={`stop-task-row ${className}`}
      data-testid={`task-row-${task.task_id}`}
      data-task-id={task.task_id}
      data-state={task.state}
      style={rowStyle}
    >
      {/* State Glyph + Task Text */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
        {/* State Glyph */}
        {!readOnly && task.state === "TODO" ? (
          <button
            type="button"
            onClick={() => onTick(task.task_id)}
            style={{
              ...actionButtonStyle,
              padding: "0",
              minWidth: "var(--target-eva, 56px)",
              minHeight: "var(--target-eva, 56px)",
              background: "transparent",
              border: "none",
            }}
            aria-label={`Mark task done: ${task.text}`}
          >
            <span style={checkboxStyle} aria-hidden="true" />
          </button>
        ) : (
          <span style={checkboxStyle} aria-hidden="true">
            {task.state === "DONE" && "✓"}
            {task.state === "SKIPPED" && "⊘"}
            {task.state === "DROPPED" && "⊘"}
          </span>
        )}

        {/* Task description & metadata tags */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontWeight: 600, color: "var(--text-2, #A9B3BE)", fontSize: "16px" }}>
              {task.state}
            </span>
            {task.origin === "ops" && (
              <span
                className="tag-ops"
                style={{
                  fontSize: "16px",
                  padding: "1px 4px",
                  backgroundColor: "var(--panel, #14181D)",
                  border: "1px solid var(--edge, #5C6670)",
                  color: "var(--text-2, #A9B3BE)",
                  borderRadius: 0,
                }}
              >
                added by ops
              </span>
            )}
            {notSynced && (
              <span
                className="tag-sync"
                style={{
                  fontSize: "16px",
                  padding: "1px 4px",
                  backgroundColor: "var(--panel, #14181D)",
                  color: "var(--text-2, #A9B3BE)",
                  fontStyle: "italic",
                }}
              >
                not synced
              </span>
            )}
          </div>
          <span
            style={{
              color: task.state === "DROPPED" || task.state === "SKIPPED" ? "var(--text-2, #A9B3BE)" : "var(--text-1, #ECEFF2)",
              textDecoration: task.state === "DROPPED" || task.state === "SKIPPED" ? "line-through" : "none",
            }}
          >
            {task.text}
          </span>
          {task.state === "SKIPPED" && task.reason && (
            <span style={{ fontSize: "16px", color: "var(--text-2, #A9B3BE)" }}>
              Reason: {task.reason}
            </span>
          )}
        </div>
      </div>

      {/* Action controls (Tick, Skip, Undo, Reason picker) */}
      {!readOnly && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {inUndoWindow && (
            <button
              type="button"
              onClick={() => onUndo(task.task_id)}
              style={actionButtonStyle}
              aria-label={`Undo task change: ${task.text}`}
            >
              UNDO
            </button>
          )}

          {task.state === "TODO" && !inUndoWindow && !showReasonPicker && (
            <button
              type="button"
              onClick={handleSkipClick}
              style={actionButtonStyle}
              aria-label={`Skip task: ${task.text}`}
            >
              SKIP
            </button>
          )}

          {showReasonPicker && (
            <div role="group" aria-label="Reason for skipping" style={{ display: "flex", gap: "8px" }}>
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleReasonSelect(r)}
                  style={{ ...actionButtonStyle, padding: "4px 8px" }}
                  aria-label={`Reason: ${r}`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StopTaskList({
  tasks,
  crewId,
  stopId,
  readOnly,
  undo,
  collapsed,
  notSyncedTaskIds,
  onTick,
  onSkip,
  onUndo,
  onReason,
  className = "",
}: StopTaskListProps): ReactElement {
  // Filter tasks for this stop and crew (crew_id === null means either crew)
  const stopTasks = tasks.filter(
    (t) => t.stop_id === stopId && (t.crew_id === null || t.crew_id === crewId)
  );

  const doneCount = stopTasks.filter((t) => t.state === "DONE").length;
  const totalCount = stopTasks.length;

  if (collapsed) {
    // Collapsed state: during walking or alerting, renders count only (04 §E.5, U-59)
    return (
      <div
        className={`stop-task-list-collapsed ${className}`}
        data-testid="tasks-collapsed-count"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
          fontSize: "16px",
          color: "var(--text-1, #ECEFF2)",
          padding: "4px 8px",
          backgroundColor: "var(--panel, #14181D)",
          border: "1px solid var(--edge, #5C6670)",
        }}
      >
        <span aria-hidden="true">✓</span>
        <span {...COUNT_ATTRS}>TASKS {doneCount}/{totalCount}</span>
      </div>
    );
  }

  return (
    <div
      className={`stop-task-list ${className}`}
      data-testid="stop-task-list"
      role="region"
      aria-label={`Stop tasks (${doneCount} of ${totalCount} completed)`}
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--panel, #14181D)",
        border: "1px solid var(--edge, #5C6670)",
      }}
    >
      {/* Header with count and synced status */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 12px",
          backgroundColor: "var(--panel, #14181D)",
          borderBottom: "1px solid var(--hairline, #2A313A)",
          fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
          fontSize: "16px",
          color: "var(--text-2, #A9B3BE)",
          textTransform: "uppercase",
        }}
      >
        <span {...COUNT_ATTRS}>
          TASKS {doneCount}/{totalCount}
        </span>
        {notSyncedTaskIds.length > 0 && (
          <span style={{ fontStyle: "italic", color: "var(--text-2, #A9B3BE)" }}>
            not synced
          </span>
        )}
      </div>

      {/* Task Rows */}
      {stopTasks.length === 0 ? (
        <div
          style={{
            minHeight: "var(--target-eva, 56px)",
            display: "flex",
            alignItems: "center",
            padding: "12px",
            color: "var(--text-2, #A9B3BE)",
            fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
            fontSize: "16px",
          }}
        >
          No tasks assigned for this stop
        </div>
      ) : (
        stopTasks.map((t) => (
          <StopTaskRow
            key={t.task_id}
            task={t}
            readOnly={readOnly}
            inUndoWindow={undo?.taskId === t.task_id}
            notSynced={notSyncedTaskIds.includes(t.task_id)}
            onTick={onTick}
            onSkip={onSkip}
            onUndo={onUndo}
            onReason={onReason}
          />
        ))
      )}
    </div>
  );
}
