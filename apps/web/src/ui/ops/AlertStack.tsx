/**
 * Alert Stack with Acknowledgement (docs/specs/04 §D.2, 03 §E.7).
 * Implementation: T25.03 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Requirements: FR-31, FR-37, FR-38.
 * Hierarchy: Warning (⬣) > Caution (▲) > Advisory (◆).
 * Warnings latch until acknowledged AND cleared.
 * Cautions latch until acknowledged and stay, marked seen, while their condition persists.
 * Highest level wins the single bar slot; counter shows others ([+N]).
 * Tapping counter opens the alert stack list.
 * Each alert provides an accessible ACK button and displays acknowledged state with role.
 * Every alert shows its severity as shape plus word (04 §A.3 #2).
 * Advisories leave the bar once cleared ("cleared alerts move to the log", 04 §D.2).
 * Advisory expiry follows snapshot sim time (FD-083), with event timestamps when available.
 */

import {
  useState,
  useRef,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { Alert, AlertLevel, Role } from "@marswalk/protocol";

export interface AlertStackProps {
  simTime?: string;
  raisedTimes?: ReadonlyMap<number, string>;
  alerts: Alert[];
  activeRole?: Role;
  /** ACK_ALERT is addressed by `alert_id` (02 §E.4); the raised sequence is not part of the command. */
  onAcknowledge?: (alertId: string) => void;
  className?: string;
}

const LEVEL_WEIGHT: Record<AlertLevel, number> = {
  warning: 3,
  caution: 2,
  advisory: 1,
};

const LEVEL_ICONS: Record<AlertLevel, string> = {
  warning: "⬣",
  caution: "▲",
  advisory: "◆",
};

/** Visible severity word beside the shape (04 §A.3 #2: colour + shape + word + fixed position). */
const LEVEL_WORDS: Record<AlertLevel, string> = {
  warning: "WARNING",
  caution: "CAUTION",
  advisory: "ADVISORY",
};

/**
 * Whether an alert still belongs on the bar (04 §D.2, 03 §E.7):
 * - warning and caution: stay while either the acknowledgement or the clearing is missing. Acknowledge = silence +
 *   mark as seen; it does not clear the condition (04 §D.2). The levels differ in sound/chime, not in visibility;
 * - advisory: does not latch; it leaves once cleared (cleared alerts move to the log).
 */
export function isOnBar(alert: Alert): boolean {
  switch (alert.level) {
    case "warning":
    case "caution":
      return alert.acked_seq === null || alert.cleared_seq === null;
    case "advisory":
      return alert.cleared_seq === null;
  }
}

/**
 * Sort alerts strictly by 04 §D.2 hierarchy:
 * 1. Level weight (warning > caution > advisory)
 * 2. Unacknowledged before acknowledged
 * 3. Most recent first (raised_seq descending)
 */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const weightDiff = (LEVEL_WEIGHT[b.level] || 0) - (LEVEL_WEIGHT[a.level] || 0);
    if (weightDiff !== 0) return weightDiff;

    const aUnacked = a.acked_seq === null ? 1 : 0;
    const bUnacked = b.acked_seq === null ? 1 : 0;
    if (bUnacked !== aUnacked) return bUnacked - aUnacked;

    return b.raised_seq - a.raised_seq;
  });
}

/**
 * AlertStack component for Ops Console and shared alert slots (04 §D.2).
 */
export function AlertStack({
  alerts,
  simTime,
  raisedTimes,
  activeRole = "ops",
  onAcknowledge,
  className = "",
}: AlertStackProps): ReactElement | null {
  const [expanded, setExpanded] = useState<boolean>(false);

  const seen = useRef(new Map<string, number>());
  const now = simTime ? Date.parse(simTime) : NaN;
  const live = (alerts ?? []).filter((alert) => {
    if (!isOnBar(alert)) return false;
    if (alert.level !== "advisory" || !Number.isFinite(now)) return true;
    const key = `${alert.alert_id}/${alert.raised_seq}`;
    const eventTime = raisedTimes?.get(alert.raised_seq);
    const raised = eventTime ? Date.parse(eventTime) : NaN;
    if (Number.isFinite(raised)) seen.current.set(key, raised);
    else if (!seen.current.has(key)) seen.current.set(key, now);
    return now - seen.current.get(key)! < 10_000;
  });
  if (live.length === 0) {
    return null;
  }

  const sorted = sortAlerts(live);
  const primary = sorted[0];
  const othersCount = sorted.length - 1;

  const isWarning = primary.level === "warning";
  const isCaution = primary.level === "caution";
  const isAdvisory = primary.level === "advisory";

  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    boxSizing: "border-box",
  };

  const primaryBarStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: "var(--alert-bar-height, 48px)",
    padding: "8px 16px",
    backgroundColor: isWarning
      ? "var(--warning-fill, #B3261E)"
      : isCaution
      ? "var(--caution-fill, #FFB020)"
      : "var(--raised, #1C2128)",
    color: isWarning
      ? "#FFFFFF"
      : isCaution
      ? "#000000"
      : "var(--text-1, #ECEFF2)",
    borderLeft: isAdvisory ? "4px solid var(--status-advisory, #4CC9F0)" : "none",
    fontWeight: 700,
    fontSize: "var(--text-alert-ops, 18px)",
    position: "relative",
  };

  const buttonStyle: CSSProperties = {
    minHeight: "32px",
    padding: "4px 12px",
    backgroundColor: isWarning ? "#FFFFFF" : "var(--panel, #14181D)",
    color: isWarning ? "var(--warning-fill, #B3261E)" : "#FFFFFF",
    border: "1px solid var(--edge, #5C6670)",
    fontWeight: 700,
    fontFamily: "var(--font-mono, monospace)",
    cursor: "pointer",
    fontSize: "13px",
  };

  const drawerStyle: CSSProperties = {
    display: expanded ? "flex" : "none",
    flexDirection: "column",
    gap: "8px",
    padding: "12px 16px",
    backgroundColor: "var(--panel, #14181D)",
    borderBottom: "2px solid var(--charcoal, #282828)",
    maxHeight: "300px",
    overflowY: "auto",
  };

  return (
    <div
      className={`alert-stack alert-slot ${className}`}
      data-level={primary.level}
      style={rootStyle}
      role="alert"
      aria-live="assertive"
    >
      {/* ------------------------------------- Primary Alert Bar (04 §D.2) */}
      <div className="alert-bar" style={primaryBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "20px" }} aria-hidden="true">
            {LEVEL_ICONS[primary.level]}
          </span>
          <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "13px", letterSpacing: "0.06em" }}>
            {LEVEL_WORDS[primary.level]}
          </span>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span data-provenance="simulated" data-source={`snapshot:alerts/${primary.alert_id}/message`}>{primary.message}</span>
          </span>

          {othersCount > 0 && (
            <button
              style={{
                ...buttonStyle,
                backgroundColor: "transparent",
                color: "inherit",
                border: "1px solid currentColor",
                fontSize: "12px",
                padding: "2px 8px",
                minHeight: "32px",
              }}
              onClick={() => setExpanded(!expanded)}
              aria-label={`${othersCount} more alerts. Click to ${expanded ? "collapse" : "expand"} list`}
            >
              <span data-provenance="simulated" data-source="snapshot:alerts">+{othersCount}</span> {expanded ? "▲" : "▼"}
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "12px" }}>
          {primary.acked_seq === null ? (
            <button
              style={buttonStyle}
              onClick={() => onAcknowledge?.(primary.alert_id)}
              aria-label={`Acknowledge alert: ${primary.message}`}
            >
              ACK
            </button>
          ) : (
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "12px",
                fontWeight: 600,
                opacity: 0.85,
                textTransform: "uppercase",
              }}
            >
              ACK {primary.acked_by ? `by ${primary.acked_by}` : ""}
            </span>
          )}
        </div>
      </div>

      {/* ---------------------------- Expanded Alert Stack List (04 §D.2) */}
      <div className="alert-stack-drawer" style={drawerStyle} aria-label="Active Alert Queue">
        <div
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "12px",
            color: "var(--text-3, #8592A0)",
            textTransform: "uppercase",
            marginBottom: "4px",
          }}
        >
          [ ACTIVE ALERT QUEUE /// {sorted.length} TOTAL ]
        </div>

        {sorted.map((alert) => {
          const isAcked = alert.acked_seq !== null;
          return (
            <article
              key={alert.alert_id}
              className={`alert-item alert-${alert.level}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                backgroundColor: "var(--raised, #1C2128)",
                borderLeft: `4px solid ${
                  alert.level === "warning"
                    ? "var(--status-warning, #FF4D4D)"
                    : alert.level === "caution"
                    ? "var(--status-caution, #FFB020)"
                    : "var(--status-advisory, #4CC9F0)"
                }`,
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                <span aria-hidden="true">{LEVEL_ICONS[alert.level]}</span>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "12px", letterSpacing: "0.06em" }}>
                  {LEVEL_WORDS[alert.level]}
                </span>
                <span style={{ fontSize: "14px", fontWeight: 600 }}>{alert.message}</span>
                {alert.subjects.length > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "12px",
                      color: "var(--text-3, #8592A0)",
                    }}
                  >
                    ({alert.subjects.join(", ")})
                  </span>
                )}
              </div>

              <div>
                {!isAcked ? (
                  <button
                    style={buttonStyle}
                    onClick={() => onAcknowledge?.(alert.alert_id)}
                    aria-label={`Acknowledge alert ${alert.message}`}
                  >
                    ACK
                  </button>
                ) : (
                  <span
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "12px",
                      color: "var(--text-2, #A9B3BE)",
                    }}
                  >
                    ACK {alert.acked_by ? `by ${alert.acked_by}` : ""}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
