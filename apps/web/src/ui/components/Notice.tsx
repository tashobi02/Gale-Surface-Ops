/**
 * Notice: the one shared element for the 03 §D notices ("Outside mapped area", "Not walkable here", "Stop limit reached")
 * (FD-115). A polite status region that is always in the DOM, so a screen reader announces a message that appears later;
 * with a message it shows the status icon and its word beside the text, never colour alone (04 §A.3 #2), and a Dismiss
 * button when the caller gives a handler. It holds no timer: the caller decides when a notice goes (sim and wall clocks
 * stay out of the UI's state, NFR-06). Colours come from the status tokens through `StatusIcon`.
 */
import type { ReactElement } from "react";
import { StatusIcon, type ExtendedStatus } from "./statusIcon";
import "./Notice.css";

export interface NoticeProps {
  /** The text, or `null` for an empty region. */
  message: string | null;
  /** Default `advisory`; `caution` and `warning` for a refusal. */
  status?: Extract<ExtendedStatus, "advisory" | "caution" | "warning" | "unknown">;
  onDismiss?: () => void;
  className?: string;
}

export function Notice({ message, status = "advisory", onDismiss, className }: NoticeProps): ReactElement {
  const empty = message === null || message === "";
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
