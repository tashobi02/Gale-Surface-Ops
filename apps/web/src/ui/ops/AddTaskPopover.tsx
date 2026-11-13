/**
 * AddTaskPopover — Popover to add a task to a planned stop (01 FR-50, 04 §E.4, Mockup handoff).
 * Implementation: T31.06 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Rules:
 * - Crew, stop (current or next), kind (observe, image, sample, measure, deploy, other)
 * - Imperative text ≤ 60 characters with remaining count (FR-50)
 * - Disabled when stop has reached maximum tasks (4) or when text is empty
 * - Mode OPS styling (#14181D panel, #1C2128 raised, #5C6670 edge, #ECEFF2 text)
 * - Keyboard accessible (NFR-04)
 */

import { useState, type CSSProperties, type ReactElement, type FormEvent } from "react";
import { StatusIcon } from "../components/statusIcon";
import type { AddStopTaskArgs, CrewId, StopTask, StopTaskKind } from "@marswalk/protocol";

export interface StopOption {
  stopId: string;
  /** Plan stop number, when known. */
  stopNo?: number;
  label: string;
}

export interface AddTaskPopoverProps {
  sessionId?: string;
  planRevision?: number;
  crewId: CrewId;
  stopId: string;
  /** Plan number of `stopId`, from the data. Absent = the label reads "—" (it is never cut out of the id). */
  stopNo?: number;
  availableStops?: StopOption[];
  maxReached?: boolean;
  tasks?: readonly StopTask[];
  disabledReason?: string;
  onAdd: (task: AddStopTaskArgs) => void;
  onCancel?: () => void;
  className?: string;
}

const TASK_KINDS: StopTaskKind[] = ["observe", "image", "sample", "measure", "deploy", "other"];
const MAX_CHARS = 60;

/** "Stop n" from the plan number, or "—" when the number is not known. */
function stopLabel(stopNo: number | undefined): string {
  return typeof stopNo === "number" && Number.isFinite(stopNo) ? `Stop ${stopNo}` : "—";
}

export function AddTaskPopover(props: AddTaskPopoverProps): ReactElement {
  return <AddTaskForm key={JSON.stringify([props.crewId, props.stopId, props.sessionId, props.planRevision])} {...props} />;
}

function AddTaskForm({
  crewId,
  stopId,
  stopNo,
  availableStops = [{ stopId, stopNo, label: stopLabel(stopNo) }],
  maxReached = false,
  tasks,
  disabledReason,
  onAdd,
  onCancel,
  className = "",
}: AddTaskPopoverProps): ReactElement {
  const [selectedCrew, setSelectedCrew] = useState<CrewId>(crewId);
  const [selectedStop, setSelectedStop] = useState<string>(stopId);
  const [selectedKind, setSelectedKind] = useState<StopTaskKind>("observe");
  const [taskText, setTaskText] = useState<string>("");

  const limitReached = maxReached || (tasks?.filter((task) => task.stop_id === selectedStop && task.state !== "DROPPED" && (task.crew_id === null || task.crew_id === selectedCrew)).length ?? 0) >= 4;
  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = taskText.trim();
    if (!trimmed || limitReached || disabledReason || trimmed.length > MAX_CHARS) {
      return;
    }
    onAdd({
      crew_id: selectedCrew,
      stop_id: selectedStop,
      kind: selectedKind,
      text: trimmed,
    });
  };

  const popoverStyle: CSSProperties = {
    backgroundColor: "var(--panel, #14181D)",
    border: "1px solid var(--edge, #5C6670)",
    borderRadius: 0,
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "12px",
    color: "var(--text-1, #ECEFF2)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
    maxWidth: "340px",
  };

  const inputStyle: CSSProperties = {
    minHeight: "32px",
    backgroundColor: "var(--raised, #1C2128)",
    border: "1px solid var(--edge, #5C6670)",
    color: "var(--text-1, #ECEFF2)",
    padding: "6px 8px",
    borderRadius: 0,
    fontFamily: "inherit",
    fontSize: "12px",
    width: "100%",
  };

  const labelStyle: CSSProperties = {
    fontSize: "12px",
    color: "var(--text-2, #A9B3BE)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };

  const buttonStyle: CSSProperties = {
    minHeight: "32px",
    padding: "6px 12px",
    backgroundColor: "var(--raised, #1C2128)",
    color: "var(--text-1, #ECEFF2)",
    border: "1px solid var(--edge, #5C6670)",
    borderRadius: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "12px",
    fontWeight: 600,
    textTransform: "uppercase",
  };

  const submitDisabled = Boolean(disabledReason) || limitReached || taskText.trim().length === 0 || taskText.length > MAX_CHARS;

  if (disabledReason) return <section style={popoverStyle} data-testid="add-task-popover" data-fallback="tasks-view-only" role="status">
    <StatusIcon status="unknown" showWord />
    <p data-provenance="simulated" data-source="result:command.ADD_STOP_TASK">View only — {disabledReason}. Crew task progress continues to sync.</p>
    {onCancel && <button type="button" style={buttonStyle} onClick={onCancel}>CLOSE</button>}
  </section>;

  return (
    <form
      className={`add-task-popover ${className}`}
      data-testid="add-task-popover"
      style={popoverStyle}
      onSubmit={handleSubmit}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel?.(); } }}
      role="dialog"
      aria-label="Add stop task"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--hairline, #2A313A)",
          paddingBottom: "6px",
          fontWeight: 700,
        }}
      >
        <span>+ ADD STOP TASK</span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              minWidth: "32px",
              minHeight: "32px",
              background: "none",
              border: "none",
              color: "var(--text-2, #A9B3BE)",
              cursor: "pointer",
              fontSize: "14px",
            }}
            aria-label="Close add task popover"
          >
            ✕
          </button>
        )}
      </div>

      {disabledReason && <p role="status">{disabledReason}</p>}
      {limitReached && (
        <div
          data-status="caution"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: "var(--status-caution, #FFB020)",
            fontSize: "12px",
            padding: "4px",
            border: "1px dashed var(--status-caution, #FFB020)",
          }}
        >
          <StatusIcon status="caution" showWord={true} />
          <span>Maximum limit of 4 tasks reached for this stop.</span>
        </div>
      )}

      {/* Crew selector */}
      <label style={labelStyle}>
        Crew
        <select
          value={selectedCrew}
          onChange={(e) => setSelectedCrew(e.target.value as CrewId)}
          style={inputStyle}
          disabled={Boolean(disabledReason)}
          aria-label="Select crew member"
        >
          <option value="EV1">EV1</option>
          <option value="EV2">EV2</option>
        </select>
      </label>

      {/* Stop selector */}
      <label style={labelStyle}>
        Stop
        <select
          value={selectedStop}
          onChange={(e) => setSelectedStop(e.target.value)}
          style={inputStyle}
          disabled={Boolean(disabledReason)}
          aria-label="Select stop"
        >
          {availableStops.map((st) => (
            <option key={st.stopId} value={st.stopId}>
              {st.label}
            </option>
          ))}
        </select>
      </label>

      {/* Task Kind */}
      <label style={labelStyle}>
        Kind
        <select
          value={selectedKind}
          onChange={(e) => setSelectedKind(e.target.value as StopTaskKind)}
          style={inputStyle}
          disabled={Boolean(disabledReason)}
          aria-label="Select task kind"
        >
          {TASK_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      {/* Task Description (≤ 60 chars) */}
      <label style={labelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Description</span>
          <span
            data-provenance="assumed"
            data-source="ui:stop-task.text-length"
            data-status={taskText.length > MAX_CHARS ? "warning" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: taskText.length > MAX_CHARS ? "var(--status-warning, #FF453A)" : "var(--text-2, #A9B3BE)",
            }}
          >
            {taskText.length > MAX_CHARS && <StatusIcon status="warning" showWord={true} />}
            <span>{taskText.length}/{MAX_CHARS}</span>
          </span>
        </div>
        <input
          type="text"
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          placeholder="Imperative task text..."
          maxLength={MAX_CHARS}
          style={inputStyle}
          disabled={Boolean(disabledReason)}
          aria-label="Enter task description"
        />
      </label>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
        {onCancel && (
          <button type="button" onClick={onCancel} style={buttonStyle}>
            CANCEL
          </button>
        )}
        <button
          type="submit"
          disabled={submitDisabled}
          aria-disabled={submitDisabled}
          style={{
            ...buttonStyle,
            backgroundColor: submitDisabled ? "var(--panel, #14181D)" : "var(--raised, #1C2128)",
            color: submitDisabled ? "var(--text-dim, #7B8794)" : "var(--text-1, #ECEFF2)",
            borderColor: submitDisabled ? "var(--hairline, #2A313A)" : "var(--text-1, #ECEFF2)",
            cursor: submitDisabled ? "not-allowed" : "pointer",
          }}
        >
          ADD TASK
        </button>
      </div>
    </form>
  );
}
