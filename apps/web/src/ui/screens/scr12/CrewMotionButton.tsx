/**
 * CrewMotionButton — HOLD / RESUME in the top-right of the EVA tablet (QoL Q2, docs/plan/qol/README.md).
 * A simulation control, not a real EVA function (02 §E.6 SET_CREW_MOTION): it carries a "SIM" tag, uses neutral chrome
 * (never a status colour) and a target of at least 56 px (04 §C.3, NFR-04). The label comes from the snapshot's
 * `crew.activity` (`simulated`), never from local state, so it flips only when the Hab Core has logged the change.
 */
import { useState, type CSSProperties, type ReactElement } from "react";
import type { CommandResult, CrewActivity, CrewId } from "@marswalk/protocol";

export interface CrewMotionButtonProps {
  crewId: CrewId;
  /** The crew member's activity from the snapshot; null when unknown. */
  activity: CrewActivity | null;
  send: (command: { kind: "SET_CREW_MOTION"; args: { crew_id: CrewId; motion: "HOLD" | "RESUME" } }) => Promise<CommandResult>;
}

const buttonStyle: CSSProperties = {
  minHeight: "var(--target-eva, 56px)",
  minWidth: "var(--target-eva, 56px)",
  padding: "8px 16px",
  backgroundColor: "var(--raised, #1C2128)",
  color: "var(--text-1, #ECEFF2)",
  border: "1px solid var(--edge, #5C6670)",
  borderRadius: 0,
  fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
  fontSize: "18px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const tagStyle: CSSProperties = {
  fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
  fontSize: "11px",
  letterSpacing: "0.08em",
  color: "var(--text-2, #A9B3BE)",
  textAlign: "center",
};

export function CrewMotionButton({ crewId, activity, send }: CrewMotionButtonProps): ReactElement {
  const [refusal, setRefusal] = useState<string | null>(null);
  const holding = activity === "HOLDING";
  const canHold = activity === "WALKING" || activity === "AT_STOP";
  const motion = holding ? "RESUME" : "HOLD";
  return (
    <div data-slot="crew-motion" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "2px", flex: "0 0 auto" }}>
      <button
        type="button"
        className="btn"
        style={{ ...buttonStyle, cursor: holding || canHold ? "pointer" : "not-allowed", opacity: holding || canHold ? 1 : 0.5 }}
        disabled={!holding && !canHold}
        aria-label={`${motion === "HOLD" ? "Hold" : "Resume"} walking (simulation control)`}
        data-provenance="simulated"
        data-source="snapshot:crew.activity"
        onClick={() => {
          // The Hab Core's reason for a refusal is shown, not swallowed (04 §D.5).
          void send({ kind: "SET_CREW_MOTION", args: { crew_id: crewId, motion } }).then((result) => {
            setRefusal(result.ok ? null : (result.message ?? "The Hab Core refused the command"));
          });
        }}
      >
        {motion}
      </button>
      <span style={tagStyle} title="Simulation control, not a real EVA function">
        SIM
      </span>
      {refusal !== null && (
        <span role="status" data-slot="crew-motion-rejection" style={{ ...tagStyle, textAlign: "right", fontSize: "14px", color: "var(--text-1, #ECEFF2)" }}>
          {refusal}
        </span>
      )}
    </div>
  );
}
