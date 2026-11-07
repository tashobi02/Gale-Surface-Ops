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
import type { CrewId, StopTaskKind } from "@marswalk/protocol";

export interface StopOption {
  stopId: string;
  stopNo: number;
  label: string;
}

export interface AddTaskPopoverProps {
  crewId: CrewId;
  stopId: string;
  availableStops?: StopOption[];
  maxReached?: boolean;
  onAdd: (task: {
    crew_id: CrewId;
    stop_id: string;
    kind: StopTaskKind;
    text: string;
  }) => void;
  onCancel?: () => void;
  className?: string;
}

const TASK_KINDS: StopTaskKind[] = ["observe", "image", "sample", "measure", "deploy", "other"];
const MAX_CHARS = 60;

export function AddTaskPopover({
  crewId,
  stopId,
  availableStops = [{ stopId, stopNo: 2, label: `Stop 2 (${stopId})` }],
  maxReached = false,
  onAdd,
  onCancel,
  className = "",
}: AddTaskPopoverProps): ReactElement {
  const [selectedCrew, setSelectedCrew] = useState<CrewId>(crewId);
  const [selectedStop, setSelectedStop] = useState<string>(stopId);
  const [selectedKind, setSelectedKind] = useState<StopTaskKind>("observe");
  const [taskText, setTaskText] = useState<string>("");

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    const trimmed = taskText.trim();
    if (!trimmed || maxReached || trimmed.length > MAX_CHARS) {
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
    borderRadius: "2px",
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
    backgroundColor: "var(--raised, #1C2128)",
    border: "1px solid var(--edge, #5C6670)",
    color: "var(--text-1, #ECEFF2)",
    padding: "6px 8px",
    borderRadius: "2px",
    fontFamily: "inherit",
    fontSize: "12px",
    width: "100%",
  };

  const labelStyle: CSSProperties = {
    fontSize: "11px",
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
    borderRadius: "2px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "12px",
    fontWeight: 600,
    textTransform: "uppercase",
  };

  const submitDisabled = maxReached || taskText.trim().length === 0 || taskText.length > MAX_CHARS;

  return (
    <form
      className={`add-task-popover ${className}`}
      data-testid="add-task-popover"
      style={popoverStyle}
      onSubmit={handleSubmit}
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

      {maxReached && (
        <div
          style={{
            color: "var(--status-caution, #FFB020)",
            fontSize: "11px",
            padding: "4px",
            border: "1px dashed var(--status-caution, #FFB020)",
          }}
        >
          Maximum limit of 4 tasks reached for this stop.
        </div>
      )}

      {/* Crew selector */}
      <label style={labelStyle}>
        Crew
        <select
          value={selectedCrew}
          onChange={(e) => setSelectedCrew(e.target.value as CrewId)}
          style={inputStyle}
          disabled={maxReached}
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
          disabled={maxReached}
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
          disabled={maxReached}
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
          <span style={{ color: taskText.length > MAX_CHARS ? "var(--status-warning, #FF453A)" : "var(--text-2, #A9B3BE)" }}>
            {taskText.length}/{MAX_CHARS}
          </span>
        </div>
        <input
          type="text"
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          placeholder="Imperative task text..."
          maxLength={MAX_CHARS}
          style={inputStyle}
          disabled={maxReached}
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
