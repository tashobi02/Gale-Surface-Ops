/**
 * TaskProgress — Per-crew task progress on the ops crew card (01 FR-50, SCR-11, Mockup handoff).
 * Implementation: T31.06 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Requirements:
 * - Shows "STOP n done/total · TOTAL done/total"
 * - Displays a simulated provenance chip (◇, data-provenance="simulated")
 * - Provides a "+ TASK" button that calls onAdd(crewId) to open AddTaskPopover
 * - Keyboard accessible (NFR-04)
 */

import type { CSSProperties, ReactElement } from "react";
import type { CrewId } from "@marswalk/protocol";

export interface TaskProgressProps {
  crewId: CrewId;
  /** Current stop: its number in the plan and its counts. */
  stopCount: { stopNo: number; done: number; total: number };
  /** Whole EVA for this crew member. */
  total: { done: number; total: number };
  onAdd: (crewId: CrewId) => void;
  disabled?: boolean;
  className?: string;
}

export function TaskProgress({
  crewId,
  stopCount,
  total,
  onAdd,
  disabled = false,
  className = "",
}: TaskProgressProps): ReactElement {
  const containerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "12px",
    color: "var(--text-1, #ECEFF2)",
    padding: "4px 0",
  };

  const progressTextStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontVariantNumeric: "tabular-nums",
  };

  const buttonStyle: CSSProperties = {
    minHeight: "28px",
    padding: "2px 8px",
    backgroundColor: disabled ? "var(--panel, #14181D)" : "var(--raised, #1C2128)",
    color: disabled ? "var(--text-dim, #7B8794)" : "var(--text-1, #ECEFF2)",
    border: "1px solid var(--edge, #5C6670)",
    borderRadius: "2px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
  };

  return (
    <div
      className={`task-progress ${className}`}
      data-testid={`task-progress-${crewId}`}
      style={containerStyle}
    >
      <div style={progressTextStyle}>
        <span>
          STOP {stopCount.stopNo} {stopCount.done}/{stopCount.total}
        </span>
        <span style={{ color: "var(--text-2, #A9B3BE)" }}>·</span>
        <span>
          TOTAL {total.done}/{total.total}
        </span>
        <span
          data-provenance="simulated"
          title="Task state is simulated"
          style={{
            fontSize: "11px",
            color: "var(--text-2, #A9B3BE)",
            display: "inline-block",
            marginLeft: "2px",
          }}
        >
          ◇
        </span>
      </div>

      <button
        type="button"
        style={buttonStyle}
        onClick={() => !disabled && onAdd(crewId)}
        disabled={disabled}
        aria-disabled={disabled ? "true" : undefined}
        aria-label={`Add task for ${crewId}`}
      >
        + TASK
      </button>
    </div>
  );
}
