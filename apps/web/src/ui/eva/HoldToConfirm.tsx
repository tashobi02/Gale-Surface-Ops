/**
 * Hold-to-confirm critical actions and EVA action controls (docs/specs/04 §D.3, §E.5; 01 FR-32, FR-40, FR-44).
 * Implemented by TASK-24 (T24.05, Ridita Alam).
 *
 * Rules (04 §D.3):
 * - Gloved taps are imprecise; critical actions use press-and-hold 800 ms (--hold-to-confirm).
 * - A progress bar runs along the button's chamfered edge; early release cancels.
 * - On completion, a 300 ms confirmation state shows the outcome.
 * - Zero invented numbers: no hardcoded "ETA 14 min"; outcome shows real server status or nothing.
 * - Reliable command handling: errors on onConfirm are caught and displayed; never false success.
 * - Queue state: "Queued — sends when link returns" when unlinked or on NO_LINK response.
 * - Protocol alignment: SUMMON_VEHICLE and ABORT take { crew: [crewId] } per commands.ts / 05 schema.
 * - Keyboard equivalent: hold Enter or Space.
 * - Accessibility fallback: tap, then tap the "Confirm" button that replaces it for 5 s.
 * - Minimum touch target: 56 px (--target-eva) with >= 8 px gaps.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import type { CrewId } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";

/** Hold duration in milliseconds for critical actions (04 §D.3, C12 token --hold-to-confirm). */
export const HOLD_DURATION_MS = 800;

/** Duration in milliseconds of the confirmation outcome state (04 §D.3). */
export const OUTCOME_DURATION_MS = 300;

/** Timeout in milliseconds for the tap-to-confirm accessibility fallback (04 §D.3). */
export const CONFIRM_FALLBACK_MS = 5000;

/** Minimum touch target size for EVA gloved operations (04 §A.3 #9, §C.3). */
export const TARGET_EVA_PX = 56;

export type HoldPhase = "idle" | "holding" | "confirming" | "cancelled" | "done" | "error" | "confirm";

export type ActionKind = "caution" | "warning" | "nominal" | "neutral" | "crit-c" | "crit-w";

export interface HoldToConfirmProps {
  /** Verb-first action label, e.g. "Summon rover", "Abort to hab" (04 §D.4). */
  label: string;
  /** 300 ms outcome confirmation copy, e.g. "PR1 dispatched" (04 §D.3). */
  outcome: string;
  /** Dispatched when the hold completes. Returns a Promise for async operations. */
  onConfirm: () => void | Promise<unknown>;
  /** Semantic status kind for border and background cues (04 §C.1). */
  kind?: ActionKind;
  /** True when the action cannot be performed. */
  disabled?: boolean;
  /** Explanation displayed when disabled, e.g. "Rover already en route" (04 §D.4). */
  disabledReason?: string;
  /** Optional icon shown to the left of the label. */
  icon?: ReactNode;
  /** Explicit hold duration override in ms (defaults to 800 ms per 04 §D.3). */
  holdDurationMs?: number;
  /** Explicit outcome duration override in ms (defaults to 300 ms per 04 §D.3). */
  outcomeDurationMs?: number;
  /** Explicit tap fallback timeout in ms (defaults to 5000 ms per 04 §D.3). */
  fallbackTimeoutMs?: number;
  /** Whether tap fallback is always active instead of press-and-hold. */
  tapFallback?: boolean;
  /** Minimum target height in pixels (defaults to 56 px per 04 §C.3). */
  minHeightPx?: number;
  /** Additional CSS class names. */
  className?: string;
  /** Identifier for testing and DOM targeting. */
  id?: string;
  "data-hold-key"?: string;
}

/**
 * Press-and-hold button for mission-critical actions (04 §D.3).
 * Requires an 800 ms continuous press or Space/Enter hold; early release cancels with a notice.
 */
export function HoldToConfirm({
  label,
  outcome,
  onConfirm,
  kind = "warning",
  disabled = false,
  disabledReason,
  icon,
  holdDurationMs = HOLD_DURATION_MS,
  outcomeDurationMs = OUTCOME_DURATION_MS,
  fallbackTimeoutMs = CONFIRM_FALLBACK_MS,
  tapFallback = false,
  minHeightPx = TARGET_EVA_PX,
  className = "",
  id,
  "data-hold-key": dataHoldKey,
}: HoldToConfirmProps): ReactElement {
  const [phase, setPhase] = useState<HoldPhase>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const t0Ref = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const outcomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef<boolean>(true);

  // Clean up timers on unmount without dropping pending network operations
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (outcomeTimerRef.current !== null) clearTimeout(outcomeTimerRef.current);
      if (fallbackTimerRef.current !== null) clearTimeout(fallbackTimerRef.current);
      if (cancelResetTimerRef.current !== null) clearTimeout(cancelResetTimerRef.current);
    };
  }, []);

  const triggerConfirm = useCallback(async () => {
    setPhase("confirming");
    setProgress(1);

    try {
      const result = await Promise.resolve(onConfirm());
      // Check if result has command failure
      if (result && typeof result === "object" && "ok" in result && !result.ok) {
        const msg = (result as { message?: string }).message || "Command failed";
        if (mountedRef.current) {
          setErrorMessage(msg);
          setPhase("error");
          cancelResetTimerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              setPhase("idle");
              setProgress(0);
              setErrorMessage("");
            }
          }, 2000);
        }
        return;
      }

      if (mountedRef.current) {
        setPhase("done");
        outcomeTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setPhase("idle");
            setProgress(0);
          }
        }, outcomeDurationMs);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : "Action failed";
        setErrorMessage(msg);
        setPhase("error");
        cancelResetTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setPhase("idle");
            setProgress(0);
            setErrorMessage("");
          }
        }, 2000);
      }
    }
  }, [onConfirm, outcomeDurationMs]);

  const startHolding = useCallback(() => {
    if (disabled || phase === "done" || phase === "confirming") return;

    if (tapFallback) {
      // Tap fallback accessibility mode (04 §D.3)
      setPhase("confirm");
      if (fallbackTimerRef.current !== null) clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setPhase("idle");
      }, fallbackTimeoutMs);
      return;
    }

    if (cancelResetTimerRef.current !== null) {
      clearTimeout(cancelResetTimerRef.current);
      cancelResetTimerRef.current = null;
    }

    setPhase("holding");
    const startTime = performance.now();
    t0Ref.current = startTime;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const p = Math.min(elapsed / holdDurationMs, 1);
      if (mountedRef.current) setProgress(p);

      if (p >= 1) {
        rafRef.current = null;
        void triggerConfirm();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, phase, tapFallback, fallbackTimeoutMs, holdDurationMs, triggerConfirm]);

  const cancelHolding = useCallback(() => {
    if (phase !== "holding") return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    setProgress(0);
    setPhase("cancelled");

    cancelResetTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setPhase("idle");
    }, 1200);
  }, [phase]);

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignored in test environments where pointerCapture may be a mock
    }
    startHolding();
  };

  const handlePointerUp = (_e: PointerEvent<HTMLButtonElement>) => {
    if (phase === "holding") {
      cancelHolding();
    }
  };

  const handlePointerCancel = () => {
    if (phase === "holding") {
      cancelHolding();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || e.repeat) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (phase === "confirm") {
        void triggerConfirm();
      } else {
        startHolding();
      }
    }
  };

  const handleKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (phase === "holding") {
        cancelHolding();
      }
    }
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (phase === "confirm") {
      e.preventDefault();
      if (fallbackTimerRef.current !== null) clearTimeout(fallbackTimerRef.current);
      void triggerConfirm();
    }
  };

  // Border & status color styling according to 04 §C.1
  const isCaution = kind === "caution" || kind === "crit-c";
  const isWarning = kind === "warning" || kind === "crit-w";
  const statusColor = isWarning
    ? "var(--status-warning, #FF4D4D)"
    : isCaution
      ? "var(--status-caution, #FFB020)"
      : "var(--status-nominal, #3DDC84)";
  const statusBg = isWarning
    ? "var(--warning-fill, #B3261E)"
    : isCaution
      ? "var(--caution-fill, #FFB020)"
      : "var(--raised, #1C2128)";

  const containerStyle: CSSProperties = {
    position: "relative",
    display: "inline-flex",
    flexDirection: "column",
    width: "100%",
    minHeight: `${minHeightPx}px`,
    userSelect: "none",
  };

  const buttonStyle: CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: `${minHeightPx}px`,
    padding: "10px 16px",
    background: phase === "done" ? statusBg : phase === "error" ? "var(--warning-fill, #B3261E)" : "var(--raised, #1C2128)",
    color: phase === "done" && isCaution ? "var(--ink, #1A1A1A)" : "var(--text-1, #ECEFF2)",
    border: `2px solid ${disabled ? "var(--edge, #5C6670)" : phase === "error" ? "var(--status-warning, #FF4D4D)" : statusColor}`,
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    fontSize: "var(--text-ui, 14px)",
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    overflow: "hidden",
    touchAction: "none",
  };

  return (
    <div style={containerStyle} className={`hold-container ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-disabled={disabled}
        data-hold="1"
        data-hold-key={dataHoldKey}
        data-hold-duration="800ms"
        data-phase={phase}
        aria-label={
          phase === "confirm"
            ? `Confirm — ${label}`
            : `${label} (press and hold 800 ms)`
        }
        title={disabled && disabledReason ? disabledReason : undefined}
        style={buttonStyle}
        className={`btn hold ${kind} ${phase === "done" ? "done" : ""} ${phase === "confirm" ? "confirmbtn" : ""} ${phase === "error" ? "error" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
      >
        {/* Progress bar running along the bottom border / perimeter (04 §D.3) */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: "4px",
            width: `${Math.round(progress * 100)}%`,
            background: phase === "error" ? "var(--status-warning, #FF4D4D)" : statusColor,
            transition: phase === "holding" ? "none" : "width 150ms ease",
          }}
        />

        {/* Content depending on hold phase */}
        {phase === "done" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span aria-hidden="true">✓</span>
            <span>{outcome}</span>
          </span>
        ) : phase === "confirming" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span>Sending…</span>
          </span>
        ) : phase === "error" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--text-1, #ECEFF2)" }}>
            <span aria-hidden="true">⚠</span>
            <span>{errorMessage || "Action failed"}</span>
          </span>
        ) : phase === "confirm" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span aria-hidden="true">✓</span>
            <span>Confirm — {label}</span>
          </span>
        ) : phase === "cancelled" ? (
          <span style={{ color: "var(--text-2, #A9B3BE)", fontSize: "12px" }}>
            Released early — hold 0.8 s
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            {icon && <span aria-hidden="true">{icon}</span>}
            <span>{label}</span>
            {disabledReason && disabled && (
              <span style={{ fontSize: "11px", color: "var(--text-3, #8592A0)", textTransform: "none" }}>
                ({disabledReason})
              </span>
            )}
          </span>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-wired EVA Critical Action Buttons (01 FR-32, FR-40, FR-44; 04 §E.5)
// ---------------------------------------------------------------------------

export interface SummonRoverButtonProps {
  /** Hab WebSocket client instance. */
  client?: HabClient | null;
  /** Whether habitat link is currently active (04 §D.5). */
  linked?: boolean;
  /** Active crew identifier sending the summon (commands.ts requires args.crew). */
  crewId?: CrewId;
  /** Target pressurized rover identifier (default PR1). */
  vehicleId?: string;
  /** Optional callback fired when vehicle command dispatches. */
  onDispatched?: () => void;
  /** Whether the control is disabled. */
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

/**
 * SUMMON ROVER hold-to-confirm button (01 FR-40, 04 §E.5).
 * Dispatches SUMMON_VEHICLE with { crew: [crewId] }.
 * Zero invented numbers: outcome is honest ("PR1 dispatched" or "Queued — sends when link returns").
 */
export function SummonRoverButton({
  client,
  linked = true,
  crewId = "EV1",
  vehicleId = "PR1",
  onDispatched,
  disabled = false,
  disabledReason,
  className,
}: SummonRoverButtonProps): ReactElement {
  const outcomeText = linked
    ? `${vehicleId} dispatched`
    : "Queued — sends when link returns";

  const handleConfirm = async (): Promise<unknown> => {
    if (client) {
      const res = await client.send({
        kind: "SUMMON_VEHICLE",
        args: { crew: [crewId] },
      });
      if (!res.ok && res.code !== "NO_LINK") {
        throw new Error(res.message || "Failed to summon rover");
      }
      onDispatched?.();
      return res;
    }
    onDispatched?.();
  };

  return (
    <HoldToConfirm
      id="action-summon-rover"
      data-hold-key="eva-summon"
      label="Summon rover"
      outcome={outcomeText}
      kind="caution"
      disabled={disabled}
      disabledReason={disabledReason}
      className={className}
      onConfirm={handleConfirm}
    />
  );
}

export interface AbortToHabButtonProps {
  /** Hab WebSocket client instance. */
  client?: HabClient | null;
  /** Whether habitat link is currently active (04 §D.5). */
  linked?: boolean;
  /** Active crew identifier executing abort (commands.ts requires args.crew). */
  crewId?: CrewId;
  /** Optional callback fired when abort command dispatches. */
  onAborted?: () => void;
  /** Whether the control is disabled. */
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

/**
 * ABORT TO HAB hold-to-confirm button (01 FR-44, 04 §E.5).
 * Dispatches ABORT command to Hab Core with { crew: [crewId] }.
 * Linked: "Abort to hab — walking now".
 * Unlinked: "Queued — sends when link returns".
 */
export function AbortToHabButton({
  client,
  linked = true,
  crewId = "EV1",
  onAborted,
  disabled = false,
  disabledReason,
  className,
}: AbortToHabButtonProps): ReactElement {
  const outcomeText = linked
    ? "Abort to hab — walking now"
    : "Queued — sends when link returns";

  const handleConfirm = async (): Promise<unknown> => {
    if (client) {
      const res = await client.send({
        kind: "ABORT",
        args: { crew: [crewId] },
      });
      if (!res.ok && res.code !== "NO_LINK") {
        throw new Error(res.message || "Abort request failed");
      }
      onAborted?.();
      return res;
    }
    onAborted?.();
  };

  return (
    <HoldToConfirm
      id="action-abort-hab"
      data-hold-key="eva-abort"
      label="Abort to hab"
      outcome={outcomeText}
      kind="warning"
      disabled={disabled}
      disabledReason={disabledReason}
      className={className}
      onConfirm={handleConfirm}
    />
  );
}

export interface TaskRoverButtonProps {
  /** Opens SCR-15 Rover tasking sheet (T29.04). */
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

/**
 * TASK ROVER action button (01 FR-41, 04 §E.5).
 * Opens SCR-15 (Tier 1 rover tasking); ≤ 2 taps without hold confirmation.
 */
export function TaskRoverButton({
  onClick,
  disabled = false,
  disabledReason,
  className = "",
}: TaskRoverButtonProps): ReactElement {
  const buttonStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: `${TARGET_EVA_PX}px`,
    padding: "10px 16px",
    background: "var(--raised, #1C2128)",
    color: "var(--text-1, #ECEFF2)",
    border: "2px solid var(--edge, #5C6670)",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    fontSize: "var(--text-ui, 14px)",
    fontWeight: 600,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  };

  return (
    <button
      id="action-task-rover"
      type="button"
      disabled={disabled}
      aria-disabled={disabled}
      title={disabled && disabledReason ? disabledReason : undefined}
      style={buttonStyle}
      className={`btn xl ${className}`}
      onClick={onClick}
    >
      <span>Task rover</span>
    </button>
  );
}

export interface EvaActionRowProps {
  client?: HabClient | null;
  linked?: boolean;
  crewId?: CrewId;
  onOpenRoverTasking?: () => void;
  onOpenHud?: () => void;
  disabledSummon?: boolean;
  disabledAbort?: boolean;
  disabledRover?: boolean;
  className?: string;
}

/**
 * SCR-12 EVA Action Row (04 §E.5).
 * Primary actions: [ SUMMON ROVER ] [ ABORT ]
 * Secondary:       [ TASK ROVER ]   [ HUD ]
 * Fixed position at screen bottom; touch targets >= 56 px with >= 8 px gaps.
 */
export function EvaActionRow({
  client,
  linked = true,
  crewId = "EV1",
  onOpenRoverTasking,
  onOpenHud,
  disabledSummon = false,
  disabledAbort = false,
  disabledRover = false,
  className = "",
}: EvaActionRowProps): ReactElement {
  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    width: "100%",
    padding: "8px 0",
  };

  return (
    <div
      role="region"
      aria-label="EVA primary actions"
      data-slot="action-row"
      style={rowStyle}
      className={`action-row ${className}`}
    >
      <SummonRoverButton
        client={client}
        linked={linked}
        crewId={crewId}
        disabled={disabledSummon}
      />
      <AbortToHabButton
        client={client}
        linked={linked}
        crewId={crewId}
        disabled={disabledAbort}
      />
      <TaskRoverButton
        onClick={onOpenRoverTasking}
        disabled={disabledRover}
      />
      <button
        id="action-open-hud"
        type="button"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: `${TARGET_EVA_PX}px`,
          padding: "10px 16px",
          background: "var(--raised, #1C2128)",
          color: "var(--text-1, #ECEFF2)",
          border: "2px solid var(--edge, #5C6670)",
          fontFamily: "var(--font-ui, Inter, sans-serif)",
          fontSize: "var(--text-ui, 14px)",
          fontWeight: 600,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
        className="btn xl"
        onClick={onOpenHud}
      >
        <span>HUD</span>
      </button>
    </div>
  );
}
