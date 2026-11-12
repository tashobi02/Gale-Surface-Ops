/**
 * Notice: the one shared element for the 03 §D notices ("Outside mapped area", "Not walkable here", "Stop limit reached")
 * (FD-115). A polite status region that is always in the DOM, so a screen reader announces a message that appears later;
 * with a message it shows the status icon and its word beside the text, never colour alone (04 §A.3 #2), and a Dismiss
 * button when the caller gives a handler, and action buttons when it gives actions (the snap offer of 03 §D). It holds no timer: the caller decides when a notice goes (sim and wall clocks
 * stay out of the UI's state, NFR-06). Colours come from the status tokens through `StatusIcon`.
 */
import type { ReactElement, ReactNode } from "react";
import { StatusIcon, type ExtendedStatus } from "./statusIcon";
import "./Notice.css";

/** A button in a notice (a snap offer: "Use snapped position", "Place elsewhere"; 03 §D). */
export interface NoticeAction {
  /** `data-action` of the button. */
  action: string;
  label: string;
  onClick: () => void;
}

export interface NoticeProps {
  /** The text, or `null` for an empty region. A node, so a value in it can carry its own `data-provenance` and `data-source`. */
  message: ReactNode | null;
  actions?: readonly NoticeAction[];
  /** Default `advisory`; `caution` and `warning` for a refusal. */
  status?: Extract<ExtendedStatus, "advisory" | "caution" | "warning" | "unknown">;
  onDismiss?: () => void;
  className?: string;
}

export function Notice({ message, status = "advisory", actions, onDismiss, className }: NoticeProps): ReactElement {
  const empty = message === null || message === undefined || message === false || message === "";
  return (
    <div
      className={`notice${className ? ` ${className}` : ""}`}
      data-slot="notice"
      role="status"
      aria-live="polite"
      {...(empty ? { "data-empty": "true" } : { "data-status": status })}
    >
      {!empty && (
        <>
          <StatusIcon status={status} />
          <span className="notice-text">{message}</span>
          {actions?.map((a) => (
            <button key={a.action} type="button" className="notice-dismiss" data-action={a.action} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
          {onDismiss && (
            <button type="button" className="notice-dismiss" data-action="dismiss-notice" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </>
      )}
    </div>
  );
}
