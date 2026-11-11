/**
 * "Taken over by another device": the full-screen notice of a live role view whose role a newer device took over
 * (docs/specs/02 §E.4, §E.6; 03 exception table "Role taken over"). The Hab Core has already closed this client's
 * socket and the client does not reconnect (net/habClient.ts), so the only way forward is the join screen, where taking
 * a role again is a deliberate, confirmed act. Shows no crew values and no provenance-labelled numbers: nothing here is
 * current. Neutral wording and a caution status (shape + word), no brand orange (04 §A.3).
 */
import type { CSSProperties, ReactElement } from "react";
import { StatusIcon } from "../components/statusIcon";

export interface TakenOverNoticeProps {
  /** What the device was: "OPS", "EV1", "EV2". */
  roleLabel: string;
  /** Default: go to `#/join`. */
  onBack?: () => void;
}

const buttonStyle: CSSProperties = {
  minHeight: "44px",
  padding: "8px 20px",
  background: "var(--raised, #1C2128)",
  color: "var(--text-1, #ECEFF2)",
  border: "1px solid var(--edge, #5C6670)",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: "14px",
  cursor: "pointer",
};

export function TakenOverNotice({ roleLabel, onBack }: TakenOverNoticeProps): ReactElement {
  const back = onBack ?? (() => void (globalThis.location.hash = "#/join"));
  return (
    <div
      role="region"
      aria-label="Taken over by another device"
      data-screen="SCR-10"
      data-slot="taken-over"
      data-status="caution"
      style={{
        minHeight: "100%",
        boxSizing: "border-box",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        color: "var(--fg-1, #ECEFF2)",
        fontFamily: "var(--font-ui, Inter, sans-serif)",
      }}
    >
      <div
        role="alert"
        aria-live="assertive"
        className="alert-bar status-caution"
        data-level="caution"
        style={{
          minHeight: "64px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 16px",
          background: "var(--caution-fill, #FFB020)",
          color: "#000000",
          fontWeight: 700,
          fontSize: "20px",
        }}
      >
        <StatusIcon status="caution" showWord={true} />
        <span>TAKEN OVER BY ANOTHER DEVICE</span>
      </div>
      <p style={{ margin: 0, fontSize: "16px" }}>
        Another device joined as {roleLabel}. This device is disconnected from the Hab Core and shows no current values. It will
        not reconnect by itself.
      </p>
      <div>
        <button type="button" data-slot="taken-over-back" onClick={back} style={buttonStyle}>
          BACK TO ROLE SELECT
        </button>
      </div>
    </div>
  );
}
