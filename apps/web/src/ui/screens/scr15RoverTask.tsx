/**
 * SCR-15 — Rover tasking (Tier 1 since 2026-11-05) (docs/specs/03 §B; layout in docs/specs/04 §E; mode OPS, 04 §B.2).
 * Purpose: Scout, carry, relay, return for the utility rover.
 * Requirements: FR-41, 03 SCR-15, 03 §C.7, 04 §E.4, NFR-05.
 * Implemented by TASK-29 (T29.04).
 */

import React, { useState, type CSSProperties, type ReactElement } from "react";
import type { RoverTaskKind, TaskRoverArgs } from "@marswalk/protocol";

export type RoverTaskViewState = "choosing" | "placing" | "confirm" | "queued" | "failed";

export interface RoverTaskProps {
  vehicleId?: string;
  initialTask?: RoverTaskKind;
  initialState?: RoverTaskViewState;
  item?: string;
  suggestedRelayTarget?: { x_m: number; y_m: number; name?: string };
  selectedTarget?: { x_m: number; y_m: number } | null;
  errorMessage?: string;
  lastDispatchedTask?: TaskRoverArgs | null;
  onDispatch?: (args: TaskRoverArgs) => Promise<void> | void;
  onClose?: () => void;
  onStartMapPlacement?: () => void;
}

const TASK_DESCRIPTIONS: Record<RoverTaskKind, string> = {
  SCOUT: "Drive, capture curated imagery, and report terrain passability.",
  CARRY: "Transport tools or collected geological samples to target.",
  RELAY: "Park at high elevation to extend communication line of sight.",
  RETURN: "Autonomous return to habitat charging dock.",
};

const panelStyle: CSSProperties = {
  backgroundColor: "var(--bg-panel, #111418)",
  color: "var(--text-1, #E8EDF2)",
  fontFamily: "var(--font-mono, monospace)",
  border: "1px solid var(--border-color, #2D3748)",
  borderRadius: "0px",
  padding: "16px",
  maxWidth: "460px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid var(--border-color, #2D3748)",
  paddingBottom: "8px",
};

const tileGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "8px",
};

const tileBtnStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  padding: "10px",
  backgroundColor: "var(--bg-surface, #1A202C)",
  border: "1px solid var(--border-color, #2D3748)",
  color: "var(--text-1, #E8EDF2)",
  cursor: "pointer",
  minHeight: "56px",
  textAlign: "left",
};

const activeTileBtnStyle: CSSProperties = {
  ...tileBtnStyle,
  backgroundColor: "var(--bg-active, #2B6CB0)",
  borderColor: "var(--border-active, #63B3ED)",
};

const actionBtnStyle: CSSProperties = {
  minHeight: "48px",
  padding: "10px 16px",
  fontFamily: "var(--font-mono, monospace)",
  fontWeight: "bold",
  fontSize: "14px",
  backgroundColor: "var(--accent-color, #4CC9F0)",
  color: "#0B0D10",
  border: "none",
  cursor: "pointer",
};

/** SCR-15 view (React, ADR-012). TASK-29. */
export function RoverTask(props: RoverTaskProps): ReactElement {
  const vehicleId = props.vehicleId || "UR1";
  const [selectedTask, setSelectedTask] = useState<RoverTaskKind>(props.initialTask || "SCOUT");
  const [target, setTarget] = useState<{ x_m: number; y_m: number } | null>(
    props.selectedTarget || (props.initialTask === "RELAY" && props.suggestedRelayTarget ? props.suggestedRelayTarget : null)
  );
  const [carryItem, setCarryItem] = useState<string>(props.item || "");
  const [state, setState] = useState<RoverTaskViewState>(props.initialState || "choosing");
  const [errorMsg, setErrorMsg] = useState<string | undefined>(props.errorMessage);

  const handleSelectTask = (task: RoverTaskKind) => {
    setSelectedTask(task);
    if (task === "RELAY" && props.suggestedRelayTarget && !target) {
      setTarget(props.suggestedRelayTarget);
    }
  };

  const handleDispatch = async () => {
    const args: TaskRoverArgs = {
      vehicle_id: vehicleId,
      task: selectedTask,
      target: selectedTask === "RETURN" ? undefined : target || undefined,
      item: selectedTask === "CARRY" ? carryItem : undefined,
    };

    try {
      if (props.onDispatch) {
        await props.onDispatch(args);
      }
      setState("queued");
    } catch (err: any) {
      setState("failed");
      setErrorMsg(err?.message || "Task dispatch rejected");
    }
  };

  return (
    <section className="scr15-rover-task" aria-label="Rover Tasking Dialog" style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <span style={{ color: "var(--text-3, #718096)", fontSize: "11px", letterSpacing: "0.08em" }}>
            [ {vehicleId} /// ROVER TASKING ]
          </span>
          <h2 style={{ margin: "4px 0 0 0", fontSize: "16px", fontWeight: 700 }}>SCR-15 TASK ROVER</h2>
        </div>
        {props.onClose && (
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close rover tasking dialog"
            style={{ background: "transparent", border: "none", color: "#E8EDF2", cursor: "pointer", fontSize: "16px" }}
          >
            ✕
          </button>
        )}
      </div>

      {/* State: QUEUED */}
      {state === "queued" && (
        <div style={{ padding: "12px", backgroundColor: "#1A365D", border: "1px solid #63B3ED" }}>
          <div style={{ fontWeight: "bold", color: "#63B3ED" }}>✓ TASK QUEUED</div>
          <div style={{ marginTop: "6px", fontSize: "13px" }}>
            {props.lastDispatchedTask?.task || selectedTask} dispatched to {vehicleId}.
          </div>
          <div style={{ marginTop: "12px" }}>
            <button
              type="button"
              style={{ ...actionBtnStyle, backgroundColor: "#2D3748", color: "#E8EDF2" }}
              onClick={() => setState("choosing")}
            >
              TASK ANOTHER
            </button>
          </div>
        </div>
      )}

      {/* State: FAILED */}
      {state === "failed" && (
        <div style={{ padding: "12px", backgroundColor: "#4A1D1D", border: "1px solid #FF4D4D" }}>
          <div style={{ fontWeight: "bold", color: "#FF4D4D" }}>⬣ TASK FAILED</div>
          <div style={{ marginTop: "6px", fontSize: "13px" }}>{errorMsg || props.errorMessage || "Dispatch error"}</div>
          <div style={{ marginTop: "12px" }}>
            <button type="button" style={actionBtnStyle} onClick={() => setState("choosing")}>
              RETRY
            </button>
          </div>
        </div>
      )}

      {/* State: CHOOSING / CONFIRM */}
      {state !== "queued" && state !== "failed" && (
        <>
          {/* Task Type Grid */}
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-3, #718096)", marginBottom: "6px" }}>TASK KIND</div>
            <div style={tileGridStyle}>
              {(["SCOUT", "CARRY", "RELAY", "RETURN"] as RoverTaskKind[]).map((kind) => {
                const active = selectedTask === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    style={active ? activeTileBtnStyle : tileBtnStyle}
                    onClick={() => handleSelectTask(kind)}
                  >
                    <span style={{ fontWeight: "bold", fontSize: "13px" }}>{kind}</span>
                    <span style={{ fontSize: "10px", color: active ? "#E2E8F0" : "#A0AEC0", marginTop: "2px" }}>
                      {kind === "RETURN" ? "Dock" : kind === "RELAY" ? "Comms" : kind === "CARRY" ? "Cargo" : "Survey"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: "12px", color: "#A0AEC0", marginTop: "6px" }}>{TASK_DESCRIPTIONS[selectedTask]}</p>
          </div>

          {/* CARRY item input */}
          {selectedTask === "CARRY" && (
            <div>
              <label htmlFor="carry-item-input" style={{ fontSize: "11px", color: "var(--text-3, #718096)", display: "block", marginBottom: "4px" }}>
                CARGO ITEM LABEL
              </label>
              <input
                id="carry-item-input"
                type="text"
                value={carryItem}
                onChange={(e) => setCarryItem(e.target.value)}
                placeholder="e.g. Core sample container"
                style={{
                  width: "100%",
                  padding: "8px",
                  backgroundColor: "#1A202C",
                  border: "1px solid #4A5568",
                  color: "#E8EDF2",
                  fontFamily: "monospace",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          {/* Suggested Ridge for RELAY */}
          {selectedTask === "RELAY" && props.suggestedRelayTarget && (
            <div style={{ padding: "8px 12px", backgroundColor: "#1A202C", border: "1px dashed #4CC9F0" }}>
              <div style={{ fontSize: "11px", color: "#4CC9F0", fontWeight: "bold" }}>SUGGESTED RELAY RIDGE</div>
              <div style={{ fontSize: "12px", marginTop: "2px" }}>
                {props.suggestedRelayTarget.name || "Ridge crest"} (
                <span data-provenance="modelled" data-source-id="mars-eqc">
                  {props.suggestedRelayTarget.x_m} m, {props.suggestedRelayTarget.y_m} m
                </span>
                )
              </div>
              <button
                type="button"
                style={{ marginTop: "6px", padding: "4px 8px", fontSize: "11px", cursor: "pointer" }}
                onClick={() => setTarget(props.suggestedRelayTarget!)}
              >
                Use this suggestion
              </button>
            </div>
          )}

          {/* Target location coordinates */}
          {selectedTask !== "RETURN" ? (
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-3, #718096)", marginBottom: "4px" }}>TARGET LOCATION</div>
              {target ? (
                <div style={{ padding: "8px", backgroundColor: "#1A202C", fontSize: "13px" }}>
                  X:{" "}
                  <span data-provenance="modelled" data-source-id="mars-eqc">
                    {target.x_m}
                  </span>{" "}
                  m, Y:{" "}
                  <span data-provenance="modelled" data-source-id="mars-eqc">
                    {target.y_m}
                  </span>{" "}
                  m
                </div>
              ) : (
                <button
                  type="button"
                  style={{ ...actionBtnStyle, backgroundColor: "#2D3748", color: "#E8EDF2", width: "100%" }}
                  onClick={props.onStartMapPlacement}
                >
                  Pick location on map
                </button>
              )}
            </div>
          ) : (
            <div style={{ padding: "8px", backgroundColor: "#1A202C", fontSize: "13px" }}>
              Destination: Return to Hab charging bay
            </div>
          )}

          {/* Confirm & Submit */}
          <div style={{ marginTop: "8px" }}>
            <button
              type="button"
              style={{ ...actionBtnStyle, width: "100%" }}
              disabled={selectedTask !== "RETURN" && !target}
              onClick={handleDispatch}
            >
              CONFIRM TASK
            </button>
          </div>
        </>
      )}
    </section>
  );
}
