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
 * Controlled: speed, pause state, session state and scenario all come from the Hab Core session (snapshot).
 * Nothing is remembered here, so a change made by another client or by the server shows at once. A value that is
 * not known (null/undefined) shows no active speed and offers no pause/resume, instead of assuming one.
 *
 * Mode OPS: Projector-readable, keyboard accessible (NFR-04).
 */

import { useEffect, useRef, type CSSProperties, type ReactElement, type ChangeEvent } from "react";
import { StatusIcon } from "../components/statusIcon";
import { logLiveFallback } from "../live/fallbackDebug";
import type { CommandKind } from "@marswalk/protocol";

export type ClockSpeed = 1 | 10 | 60;
export type SessionState = "LOADED" | "RUNNING" | "PAUSED" | "ENDED";

export interface ScenarioOption {
  id: string;
  label: string;
}

export interface ClockControlProps {
  /** Session clock speed; null/undefined = unknown (no speed is shown as active). */
  speed?: ClockSpeed | null;
  /** Session clock paused flag; null/undefined = unknown (pause/resume is disabled). */
  isPaused?: boolean | null;
  /** Session status; START EVA is offered only while "LOADED". */
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
  speed,
  isPaused,
  sessionState,
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
  const keysOnly = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("clock") === "keys";
  const scenarioAvailable = availableScenarios.some((item) => item.id === activeScenarioId);
  const paused = isPaused ?? null;
  const currentSpeed = speed ?? null;

  const handlePauseToggle = (): void => {
    if (paused === null) return;
    const next = !paused;
    onPauseResume?.(next);
    onCommand?.({
      kind: "SET_CLOCK",
      args: { paused: next },
    });
  };

  const handleSpeedSelect = (newSpeed: ClockSpeed): void => {
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

  /**
   * The keydown listener is registered once (it must not be re-registered on every render), so it reads the current
   * session state and the current handlers from this ref instead of closing over the ones of the registering render.
   */
  const latest = useRef({ sessionState, handlePauseToggle, handleJumpNext, handleStartEva, handleSpeedSelect });
  latest.current = { sessionState, handlePauseToggle, handleJumpNext, handleStartEva, handleSpeedSelect };

  const handleScenarioChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const nextId = e.target.value;
    onLoadScenario?.(nextId);
    onCommand?.({
      kind: "LOAD_SCENARIO",
      args: { scenario_id: nextId },
    });
  };

  useEffect(() => {
    if (!keysOnly) return;
    logLiveFallback("clock-keys");
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        (event.target instanceof Element && event.target.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="dialog"]'))) return;
      // The listener is registered once, so it reads the current session state and the current handlers from the ref
      // rather than closing over the ones of the render that registered it.
      const current = latest.current;
      const state = current.sessionState;
      if (!state || state === "ENDED") return;
      const key = event.key.toLowerCase();
      if (!["1", "2", "3", " ", "n", "s"].includes(key)) return;
      event.preventDefault();
      if (key === " ") current.handlePauseToggle();
      else if (key === "n") current.handleJumpNext();
      else if (key === "s" && state === "LOADED") current.handleStartEva();
      else if (key === "1") current.handleSpeedSelect(1);
      else if (key === "2") current.handleSpeedSelect(10);
      else if (key === "3") current.handleSpeedSelect(60);
    };
    // Capture prevents the console's existing shortcuts from issuing the same command a second time.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [keysOnly]);

  const containerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "12px",
  };

  const buttonStyle: CSSProperties = {
    minWidth: "32px",
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
    minWidth: "32px",
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
  // The multiplier in force is a displayed value of the simulated session clock (FR-15). The other two are the labels of
  // the controls that would set it, so their digits only name a preset (FD-480).
  const speedInForce = { "data-provenance": "simulated", "data-source": "snapshot:session.clock.speed" } as const;

  if (keysOnly) return <div data-testid="clock-control" data-fallback="clock-keys" role="group" aria-label="Mission clock keyboard controls" style={containerStyle}>
    <StatusIcon status="unknown" showWord />
    <span data-provenance="assumed" data-source="rule:T25.09">Keyboard only: Space pause/resume · 1/2/3 speed · N jump · S start EVA</span>
  </div>;

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
        data-provenance="simulated"
        data-source={scenarioAvailable ? "snapshot:session.scenario_id" : "unavailable:session.scenario_id"}
        data-unavailable={scenarioAvailable ? undefined : "true"}
        value={scenarioAvailable ? activeScenarioId : ""}
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

      <button type="button" style={buttonStyle} disabled={!scenarioAvailable} onClick={() => {
        if (!scenarioAvailable || !activeScenarioId) return;
        onLoadScenario?.(activeScenarioId);
        onCommand?.({ kind: "LOAD_SCENARIO", args: { scenario_id: activeScenarioId } });
      }} aria-label="Load scenario">LOAD</button>

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
        disabled={paused === null}
        style={paused ? activeButtonStyle : buttonStyle}
        aria-label={
          paused === null
            ? "Pause or resume mission clock (state unknown)"
            : paused
              ? "Resume mission clock"
              : "Pause mission clock"
        }
        title={paused === null ? "Clock state unknown" : paused ? "Resume (▶)" : "Pause (⏸)"}
      >
        {paused === null ? "—" : paused ? "▶" : "⏸"}
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
            <span {...(isActive ? speedInForce : { "data-identifier": "" })}>{s}×</span>
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
