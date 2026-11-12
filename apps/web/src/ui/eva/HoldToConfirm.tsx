/**
 * Hold-to-confirm critical actions and EVA action controls (docs/specs/04 §D.3, §E.5; 01 FR-32, FR-40, FR-44).
 * Implemented by TASK-24 (T24.05, Ridita Alam).
 *
 * Rules (04 §D.3):
 * - Gloved taps are imprecise; critical actions use press-and-hold 800 ms (--hold-to-confirm).
 * - A progress bar runs along the button's chamfered edge; early release cancels, and so does a pointer that leaves
 *   the button, loses its capture or moves outside the button's box (a captured touch never fires "leave"); a control
 *   that becomes disabled mid-hold never confirms.
 * - The command is dispatched when the hold completes. The button then shows "pending" (or "queued" while
 *   unlinked) until the Hab Core answers; only an accepted result shows the 300 ms confirmation outcome, a
 *   rejected result shows its reason and stays until the next press. Nothing claims success before the answer.
 * - Keyboard equivalent: hold Enter or Space.
 * - Accessibility fallback: tap, then tap the "Confirm" button that replaces it for 5 s.
 * - Minimum touch target: 56 px (--target-eva) with >= 8 px gaps.
 * - Unlinked: commands queue through habClient and show "Queued — sends when link returns".
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

export type HoldPhase = "idle" | "holding" | "cancelled" | "pending" | "done" | "rejected" | "confirm";

/**
 * What a confirmed action reports back. A Hab Core `CommandResult` fits: `ok: false` means rejected.
 * Returning nothing means the action has no answer to wait for and counts as accepted.
 */
export type ConfirmOutcome = void | { ok: true } | { ok: false; code?: string; message?: string };

export type ActionKind = "caution" | "warning" | "nominal" | "neutral" | "crit-c" | "crit-w";

export interface HoldToConfirmProps {
  /** Verb-first action label, e.g. "Summon rover", "Abort to hab" (04 §D.4). */
  label: string;
  /** 300 ms outcome copy shown only after the action was accepted, e.g. "Summon accepted" (04 §D.3). */
  outcome: string;
  /** Copy while waiting for the Hab Core's answer. */
  pendingText?: string;
  /** Copy while waiting and the link is down (commands queue, 04 §D.5). */
  queuedText?: string;
  /** True while unlinked: the pending state reads `queuedText`. */
  queued?: boolean;
  /** Dispatched when the hold completes; its result decides between the accepted and rejected states. */
  onConfirm: () => ConfirmOutcome | Promise<ConfirmOutcome>;
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
  pendingText = "Sending…",
  queuedText = "Queued — sends when link returns",
  queued = false,
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
  const [rejection, setRejection] = useState<string>("");

  const rafRef = useRef<number | null>(null);
  const outcomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef<boolean>(true);
  const inFlightRef = useRef<boolean>(false);
  const disabledRef = useRef<boolean>(disabled);
  disabledRef.current = disabled;
  /** What started the current hold: only a pointer hold is cancelled by the pointer leaving. */
  const holdSourceRef = useRef<"pointer" | "key">("pointer");

  // Clean up timers on unmount
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

  // A control that turns disabled underneath a hold or an armed "Confirm" drops back to idle; it never confirms.
  useEffect(() => {
    if (!disabled) return;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    setPhase((p) => (p === "holding" || p === "confirm" || p === "cancelled" ? "idle" : p));
    if (!inFlightRef.current) setProgress(0);
  }, [disabled]);

  const triggerConfirm = useCallback(async () => {
    // One dispatch per confirmation, however many taps or key repeats arrive while pending.
    if (inFlightRef.current || disabledRef.current) return;
    inFlightRef.current = true;
    if (fallbackTimerRef.current !== null) clearTimeout(fallbackTimerRef.current);
    setPhase("pending");
    setProgress(1);

    let result: ConfirmOutcome;
    try {
      result = await onConfirm();
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : "Command failed" };
    }
    inFlightRef.current = false;
    if (!mountedRef.current) return;

    if (result && result.ok === false) {
      setRejection([result.code, result.message].filter(Boolean).join(": ") || "Rejected");
      setProgress(0);
      setPhase("rejected");
      return;
    }

    setPhase("done");
    outcomeTimerRef.current = setTimeout(() => {
      setPhase("idle");
      setProgress(0);
    }, outcomeDurationMs);
  }, [onConfirm, outcomeDurationMs]);

  /**
   * Accessibility fallback (04 §D.3): the first tap turns the button into "Confirm" for `fallbackTimeoutMs`;
   * only a second tap (or Enter/Space) confirms. Never confirms on the first tap.
   */
  const armFallback = useCallback(() => {
    setPhase("confirm");
    if (fallbackTimerRef.current !== null) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => {
      setPhase("idle");
    }, fallbackTimeoutMs);
  }, [fallbackTimeoutMs]);

  const startHolding = useCallback((source: "pointer" | "key") => {
    if (disabled || phase === "done" || phase === "pending") return;
    holdSourceRef.current = source;

    if (cancelResetTimerRef.current !== null) {
      clearTimeout(cancelResetTimerRef.current);
      cancelResetTimerRef.current = null;
    }

    setPhase("holding");
    const startTime = performance.now();

    const tick = () => {
      if (disabledRef.current) {
        rafRef.current = null;
        return;
      }
      const elapsed = performance.now() - startTime;
      const p = Math.min(elapsed / holdDurationMs, 1);
      setProgress(p);

      if (p >= 1) {
        rafRef.current = null;
        void triggerConfirm();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, phase, holdDurationMs, triggerConfirm]);

  const cancelHolding = useCallback(() => {
    if (phase !== "holding") return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    setProgress(0);
    setPhase("cancelled");

    cancelResetTimerRef.current = setTimeout(() => {
      setPhase("idle");
    }, 1200);
  }, [phase]);

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    // In tap-fallback mode the click event alone drives the two taps.
    if (tapFallback || e.button !== 0 || disabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    startHolding("pointer");
  };

  const handlePointerUp = () => {
    if (phase === "holding") {
      cancelHolding();
    }
  };

  const handlePointerCancel = () => {
    if (phase === "holding") {
      cancelHolding();
    }
  };

  // The pointer left the button or lost its capture: a pointer hold ends (a key hold is unaffected).
  const handlePointerAway = () => {
    if (phase === "holding" && holdSourceRef.current === "pointer") cancelHolding();
  };

  // A captured touch never fires "leave", so a move outside the button's box ends the hold too.
  const handlePointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (phase !== "holding" || holdSourceRef.current !== "pointer") return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cancelHolding();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || e.repeat) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (tapFallback || phase === "confirm") {
        if (phase === "confirm") void triggerConfirm();
        else if (phase !== "pending" && phase !== "done") armFallback();
      } else {
        startHolding("key");
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
    if (!tapFallback || disabled) return;
    e.preventDefault();
    if (phase === "confirm") {
      void triggerConfirm();
    } else if (phase !== "pending" && phase !== "done") {
      armFallback();
    }
  };

  // Border & status color styling according to 04 §C.1
  const isCaution = kind === "caution" || kind === "crit-c";
  const isWarning = kind === "warning" || kind === "crit-w";
  const statusColor = isWarning ? "var(--warning, #FF4D4D)" : isCaution ? "var(--caution, #FFB020)" : "var(--nominal, #3DDC84)";
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
    background: phase === "done" ? statusBg : "var(--raised, #1C2128)",
    color: phase === "done" && isCaution ? "var(--ink, #1A1A1A)" : "var(--text-1, #ECEFF2)",
    border: `2px solid ${disabled ? "var(--edge, #5C6670)" : statusColor}`,
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    fontSize: "16px", // EVA minimum text size (04 §A.3 #9)
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
        data-hold-duration={`${holdDurationMs}ms`}
        data-phase={phase}
        aria-label={
          phase === "confirm"
            ? `Confirm — ${label}`
            : tapFallback
              ? `${label} (tap, then tap again to confirm)`
              : `${label} (press and hold 800 ms)`
        }
        title={disabled && disabledReason ? disabledReason : undefined}
        style={buttonStyle}
        className={`btn hold ${kind} ${phase === "done" ? "done" : ""} ${phase === "confirm" ? "confirmbtn" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerAway}
        onLostPointerCapture={handlePointerAway}
        onPointerMove={handlePointerMove}
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
            background: statusColor,
            transition: phase === "holding" ? "none" : "width 150ms ease",
          }}
        />

        {/* Content depending on hold phase */}
        {phase === "pending" ? (
          <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span aria-hidden="true">…</span>
            <span>{queued ? queuedText : pendingText}</span>
          </span>
        ) : phase === "rejected" ? (
          <span role="alert" style={{ display: "inline-flex", alignItems: "center", gap: "8px", textTransform: "none" }}>
            <span aria-hidden="true">✕</span>
            <span>Rejected — {rejection}</span>
          </span>
        ) : phase === "done" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span aria-hidden="true">✓</span>
            <span>{outcome}</span>
          </span>
        ) : phase === "confirm" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span aria-hidden="true">✓</span>
            <span>Confirm — {label}</span>
          </span>
        ) : phase === "cancelled" ? (
          <span style={{ color: "var(--text-2, #A9B3BE)", fontSize: "16px" }}>
            Released early — hold 0.8 s
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            {icon && <span aria-hidden="true">{icon}</span>}
            <span>{label}</span>
            {disabledReason && disabled && (
              <span style={{ fontSize: "16px", color: "var(--text-3, #8592A0)", textTransform: "none" }}>
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

/** Why a wired control is disabled: no Hab Core client, or no crew member to act for. Undefined when usable. */
function missingInput(client: HabClient | null | undefined, crewId: CrewId | undefined): string | undefined {
  if (!client) return "No Hab Core connection";
  if (!crewId) return "Crew not identified";
  return undefined;
}

/** Sends one command and passes the Hab Core's answer back; `onAccepted` runs only when it was accepted. */
async function sendAndReport(
  client: HabClient,
  command: Parameters<HabClient["send"]>[0],
  onAccepted?: () => void,
): Promise<ConfirmOutcome> {
  const result = await client.send(command);
  if (result.ok) onAccepted?.();
  return result;
}

export interface SummonRoverButtonProps {
  tapFallback?: boolean;
  /** Hab WebSocket client instance. Without one the control is disabled. */
  client?: HabClient | null;
  /** Crew member acting; SUMMON_VEHICLE needs `args.crew` to include the issuer (02 §E.4). Without one the control is disabled. */
  crewId?: CrewId;
  /** Link state: false queues the command (04 §D.5); null or undefined means unknown. */
  linked?: boolean | null;
  /** Optional proposed rendezvous option this summon executes (SUMMON_VEHICLE `option_id`). */
  optionId?: string;
  /** Fired only after the Hab Core accepted the command. */
  onDispatched?: () => void;
  /** Whether the control is disabled. */
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

/**
 * SUMMON ROVER hold-to-confirm button (01 FR-40, 04 §E.5).
 * Dispatches SUMMON_VEHICLE `{ crew: [crewId] }` (plus `option_id` when given) once, then shows pending
 * (or queued while unlinked) until the Hab Core answers; only an accepted result shows "Summon accepted".
 */
export function SummonRoverButton({
  client,
  crewId,
  linked,
  optionId,
  onDispatched,
  tapFallback = false,
  disabled = false,
  disabledReason,
  className,
}: SummonRoverButtonProps): ReactElement {
  const missing = missingInput(client, crewId);

  const handleConfirm = async (): Promise<ConfirmOutcome> => {
    if (!client || !crewId) return { ok: false, message: missing };
    return sendAndReport(
      client,
      {
        kind: "SUMMON_VEHICLE",
        args: { crew: [crewId], ...(optionId === undefined ? {} : { option_id: optionId }) },
      },
      onDispatched,
    );
  };

  return (
    <HoldToConfirm
      id="action-summon-rover"
      tapFallback={tapFallback}
      data-hold-key="eva-summon"
      label="Summon rover"
      outcome="Summon accepted"
      queued={linked === false}
      kind="caution"
      disabled={disabled || missing !== undefined}
      disabledReason={disabledReason ?? missing}
      className={className}
      onConfirm={handleConfirm}
    />
  );
}

export interface AbortToHabButtonProps {
  tapFallback?: boolean;
  /** Hab WebSocket client instance. Without one the control is disabled. */
  client?: HabClient | null;
  /** Crew member acting; ABORT needs `args.crew` to include the issuer (02 §E.4). Without one the control is disabled. */
  crewId?: CrewId;
  /** Link state: false queues the command (04 §D.5); null or undefined means unknown. */
  linked?: boolean | null;
  /** Fired only after the Hab Core accepted the command. */
  onAborted?: () => void;
  /** Whether the control is disabled. */
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

/**
 * ABORT TO HAB hold-to-confirm button (01 FR-44, 04 §E.5).
 * Dispatches ABORT `{ crew: [crewId] }` once; "Abort accepted" only after the Hab Core accepts it. It makes
 * no claim about walking or arrival.
 */
export function AbortToHabButton({
  client,
  crewId,
  linked,
  onAborted,
  tapFallback = false,
  disabled = false,
  disabledReason,
  className,
}: AbortToHabButtonProps): ReactElement {
  const missing = missingInput(client, crewId);

  const handleConfirm = async (): Promise<ConfirmOutcome> => {
    if (!client || !crewId) return { ok: false, message: missing };
    return sendAndReport(client, { kind: "ABORT", args: { crew: [crewId] } }, onAborted);
  };

  return (
    <HoldToConfirm
      id="action-abort-hab"
      tapFallback={tapFallback}
      data-hold-key="eva-abort"
      label="Abort to hab"
      outcome="Abort accepted"
      queued={linked === false}
      kind="warning"
      disabled={disabled || missing !== undefined}
      disabledReason={disabledReason ?? missing}
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
    fontSize: "16px",
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
  tapFallback?: boolean;
  contrast?: boolean;
  onContrast?: () => void;
  onTapFallback?: () => void;
  client?: HabClient | null;
  /** Crew member the row acts for; SUMMON and ABORT are disabled without one. */
  crewId?: CrewId;
  linked?: boolean | null;
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
  crewId,
  linked,
  onOpenRoverTasking,
  onOpenHud,
  tapFallback = false,
  contrast = false,
  onContrast,
  onTapFallback,
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
        crewId={crewId}
        linked={linked}
        tapFallback={tapFallback}
        disabled={disabledSummon}
      />
      <AbortToHabButton
        client={client}
        crewId={crewId}
        linked={linked}
        tapFallback={tapFallback}
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
          fontSize: "16px",
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
      {onContrast && <button type="button" className="btn xl" aria-label="Toggle high contrast" aria-pressed={contrast} onClick={onContrast}>CONTRAST</button>}
      {onTapFallback && <button type="button" className="btn xl" aria-label="Tap confirm" aria-pressed={tapFallback} onClick={onTapFallback}>TAP CONFIRM</button>}
    </div>
  );
}

