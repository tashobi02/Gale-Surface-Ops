/**
 * ClockControl — Mission clock control and scenario loader (01 FR-34, 02 §D.14, 04 §E.4).
 * Implementation: T25.05 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Controls:
 * - Speed multipliers: 1×, 10×, 60× (04 §E.4: "⏸ 1× 10× [60×] ⏭")
 * - Pause / Resume toggle
 * - Step / Jump to next event (⏭ / JUMP_NEXT_EVENT)
 * - Scenario selector (LOAD_SCENARIO)
 * - Start EVA action (START_EVA)
 *
 * Mode OPS: Projector-readable, keyboard accessible (NFR-04).
 */

import { useState, type CSSProperties, type ReactElement, type ChangeEvent } from "react";
import type { CommandKind } from "@marswalk/protocol";

export type ClockSpeed = 1 | 10 | 60;
export type SessionState = "LOADED" | "RUNNING" | "PAUSED" | "ENDED";

export interface ScenarioOption {
  id: string;
  label: string;
}

export interface ClockControlProps {
  speed?: ClockSpeed;
  isPaused?: boolean;
  sessionState?: SessionState;
  activeScenarioId?: string;
  availableScenarios?: ScenarioOption[];
  onSetSpeed?: (speed: ClockSpeed) => void;
  onPauseResume?: (paused: boolean) => void;
  onJumpNextEvent?: () => void;
  onStartEva?: () => void;
  onLoadScenario?: (scenarioId: string) => void;
  onCommand?: (command: { kind: CommandKind; args: Record<string, unknown> }) => void;
  className?: string;
}

export function ClockControl({
  speed = 1,
  isPaused = false,
  sessionState = "RUNNING",
  activeScenarioId,
  // No invented scenario catalogue: with none supplied, only the active scenario (if any) is listed.
  availableScenarios = activeScenarioId ? [{ id: activeScenarioId, label: activeScenarioId }] : [],
  onSetSpeed,
  onPauseResume,
  onJumpNextEvent,
  onStartEva,
  onLoadScenario,
  onCommand,
  className = "",
}: ClockControlProps): ReactElement {
  const [internalPaused, setInternalPaused] = useState(isPaused);
  const [internalSpeed, setInternalSpeed] = useState<ClockSpeed>(speed);
  const [selectedScenario, setSelectedScenario] = useState(activeScenarioId ?? "");

  const paused = isPaused ?? internalPaused;
  const currentSpeed = speed ?? internalSpeed;

  const handlePauseToggle = (): void => {
    const next = !paused;
    setInternalPaused(next);
    onPauseResume?.(next);
    onCommand?.({
      kind: "SET_CLOCK",
      args: { paused: next },
    });
  };

  const handleSpeedSelect = (newSpeed: ClockSpeed): void => {
    setInternalSpeed(newSpeed);
    onSetSpeed?.(newSpeed);
    onCommand?.({
      kind: "SET_CLOCK",
      args: { speed: newSpeed },
    });
  };

  const handleJumpNext = (): void => {
    onJumpNextEvent?.();
    onCommand?.({
      kind: "JUMP_NEXT_EVENT",
      args: {},
    });
  };

  const handleStartEva = (): void => {
    onStartEva?.();
    onCommand?.({
      kind: "START_EVA",
      args: {},
    });
  };

  const handleScenarioChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const nextId = e.target.value;
    setSelectedScenario(nextId);
    onLoadScenario?.(nextId);
    onCommand?.({
      kind: "LOAD_SCENARIO",
      args: { scenario_id: nextId },
    });
  };

  const containerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "12px",
  };

  const buttonStyle: CSSProperties = {
    minHeight: "32px",
    padding: "4px 10px",
    backgroundColor: "var(--raised, #1C2128)",
    color: "var(--text-1, #ECEFF2)",
    border: "1px solid var(--edge, #5C6670)",
    borderRadius: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "12px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const activeButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: "var(--panel, #14181D)",
    borderColor: "var(--text-1, #ECEFF2)",
    color: "var(--text-1, #ECEFF2)",
    fontWeight: 700,
  };

  const selectStyle: CSSProperties = {
    minHeight: "32px",
    padding: "4px 8px",
    backgroundColor: "var(--raised, #1C2128)",
    color: "var(--text-1, #ECEFF2)",
    border: "1px solid var(--edge, #5C6670)",
    borderRadius: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "12px",
  };

  const SPEEDS: ClockSpeed[] = [1, 10, 60];

  return (
    <div
      className={`clock-control ${className}`}
      data-testid="clock-control"
      style={containerStyle}
      role="toolbar"
      aria-label="Mission clock and scenario controls"
    >
      {/* Scenario selector */}
      <select
        aria-label="Select mission scenario"
        value={selectedScenario}
        onChange={handleScenarioChange}
        style={selectStyle}
        title="Load scenario"
      >
        {availableScenarios.length === 0 && <option value="">—</option>}
        {availableScenarios.map((sc) => (
          <option key={sc.id} value={sc.id}>
            {sc.label}
          </option>
        ))}
      </select>

      {/* Start EVA button if state is LOADED */}
      {sessionState === "LOADED" && (
        <button
          type="button"
          onClick={handleStartEva}
          style={{
            ...buttonStyle,
            // Neutral chrome: START EVA is an action, not a status (04 §A.3: status colours mean status only)
            borderColor: "var(--text-1, #ECEFF2)",
            color: "var(--text-1, #ECEFF2)",
            fontWeight: 700,
          }}
          aria-label="Start EVA mission"
          title="Start EVA"
        >
          START EVA
        </button>
      )}

      {/* Pause / Resume Button */}
      <button
        type="button"
        onClick={handlePauseToggle}
        style={paused ? activeButtonStyle : buttonStyle}
        aria-label={paused ? "Resume mission clock" : "Pause mission clock"}
        title={paused ? "Resume (▶)" : "Pause (⏸)"}
      >
        {paused ? "▶" : "⏸"}
      </button>

      {/* Speed multiplier buttons: 1×, 10×, 60× */}
      {SPEEDS.map((s) => {
        const isActive = currentSpeed === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => handleSpeedSelect(s)}
            style={isActive ? activeButtonStyle : buttonStyle}
            aria-label={`Set speed to ${s}x`}
            aria-pressed={isActive}
            title={`Speed ${s}×`}
          >
            {s}×
          </button>
        );
      })}

      {/* Jump to next event button */}
      <button
        type="button"
        onClick={handleJumpNext}
        style={buttonStyle}
        aria-label="Jump to next scheduled event"
        title="Jump to next event (⏭)"
      >
        ⏭
      </button>
    </div>
  );
}
