/**
 * TaskProgress — Per-crew task progress on the ops crew card (01 FR-50, SCR-11, Mockup handoff).
 * Implementation: T31.06 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Requirements:
 * - Shows "STOP n done/total · TOTAL done/total", or "—" for counts that were not supplied
 * - Displays a simulated provenance chip (◇, data-provenance="simulated")
 * - Provides a "+ TASK" button that calls onAdd(crewId) to open AddTaskPopover
 * - Keyboard accessible (NFR-04)
 */

import type { CSSProperties, ReactElement } from "react";
import type { CrewId } from "@marswalk/protocol";
import { UNAVAILABLE, isFiniteNumber } from "../components/provenance";

export interface TaskProgressProps {
  crewId: CrewId;
  /** Current stop: its number in the plan and its counts. null shows "—" (no counts supplied; nothing is inferred). */
  stopCount: { stopNo: number; done: number; total: number } | null;
  /** Whole EVA for this crew member. null shows "—". */
  total: { done: number; total: number } | null;
  onAdd: (crewId: CrewId) => void;
  disabled?: boolean;
  className?: string;
}

/** Task states come from the simulated session (FR-50); counts are reduced from the supplied task list. */
const SIMULATED = { "data-provenance": "simulated", "data-source": "snapshot:tasks", title: "snapshot:tasks" } as const;
const UNAVAILABLE_ATTRS = {
  "data-provenance": "assumed",
  "data-source": "unavailable:tasks.counts",
  title: "unavailable:tasks.counts",
} as const;

export function TaskProgress({
  crewId,
  stopCount,
  total,
  onAdd,
  disabled = false,
  className = "",
}: TaskProgressProps): ReactElement {
  const stopText =
    stopCount && isFiniteNumber(stopCount.done) && isFiniteNumber(stopCount.total)
      ? `${stopCount.stopNo} ${stopCount.done}/${stopCount.total}`
      : null;
  const totalText =
    total && isFiniteNumber(total.done) && isFiniteNumber(total.total) ? `${total.done}/${total.total}` : null;

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
    borderRadius: 0,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    fontSize: "12px",
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
        <span {...(stopText ? SIMULATED : UNAVAILABLE_ATTRS)}>
          STOP {stopText ?? UNAVAILABLE}
        </span>
        <span style={{ color: "var(--text-2, #A9B3BE)" }}>·</span>
        <span {...(totalText ? SIMULATED : UNAVAILABLE_ATTRS)}>
          TOTAL {totalText ?? UNAVAILABLE}
        </span>
        <span
          data-provenance="simulated"
          data-source="snapshot:tasks"
          title="Task state is simulated (snapshot:tasks)"
          style={{
            fontSize: "12px",
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
