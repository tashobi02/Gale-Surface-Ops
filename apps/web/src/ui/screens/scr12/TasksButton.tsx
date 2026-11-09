/**
 * TasksButton — TASKS button on the EVA tablet (04 §E.5, Mockup handoff G-30, G-31, U-51).
 * Implementation: T31.05 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Requirements:
 * - Labelled button with icon, word "TASKS" and count (e.g. "TASKS 1/4")
 * - Touch target ≥ 56 px on EVA (04 §C.3, NFR-04)
 * - Neutral chrome (no status color)
 */

import type { CSSProperties, ReactElement } from "react";
import { UNAVAILABLE, isFiniteNumber } from "../../components/provenance";

export interface TasksButtonProps {
  /** Tasks done at the current stop; null when no stop (and so no count) is known. */
  doneCount: number | null;
  /** Tasks at the current stop; null when no stop is known. */
  totalCount: number | null;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}

export function TasksButton({
  doneCount,
  totalCount,
  active = false,
  onClick,
  className = "",
  ariaLabel,
}: TasksButtonProps): ReactElement {
  const buttonStyle: CSSProperties = {
    minHeight: "var(--target-eva, 56px)",
    minWidth: "var(--target-eva, 56px)",
    padding: "8px 16px",
    backgroundColor: active ? "var(--edge, #5C6670)" : "var(--raised, #1C2128)",
    color: "var(--text-1, #ECEFF2)",
    border: "1px solid var(--edge, #5C6670)",
    borderRadius: 0,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "16px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };

  const countBadgeStyle: CSSProperties = {
    fontVariantNumeric: "tabular-nums",
    padding: "2px 6px",
    backgroundColor: "var(--panel, #14181D)",
    borderRadius: 0,
    fontSize: "16px",
  };

  const counts = isFiniteNumber(doneCount) && isFiniteNumber(totalCount) ? `${doneCount}/${totalCount}` : UNAVAILABLE;

  return (
    <button
      type="button"
      className={`tasks-button ${className}`}
      data-testid="tasks-button"
      style={buttonStyle}
      onClick={onClick}
      aria-label={
        ariaLabel ??
        (counts === UNAVAILABLE ? "View tasks: count unavailable" : `View tasks: ${doneCount} of ${totalCount} completed`)
      }
      aria-pressed={active}
    >
      <span aria-hidden="true" style={{ fontSize: "15px" }}>
        ✓
      </span>
      <span>TASKS</span>
      <span
        style={countBadgeStyle}
        data-provenance="simulated"
        data-source="snapshot:tasks"
        title="snapshot:tasks"
      >
        {counts}
      </span>
    </button>
  );
}
