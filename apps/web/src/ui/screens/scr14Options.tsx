/**
 * SCR-14 — Options sheet (EVA) / options panel (ops) (docs/specs/03 §B; layout in docs/specs/04 §E.7; mode OPS, 04 §B.2).
 * Purpose: Ranked contingency options with ETA, expected dose and dropped stops; hold-to-confirm on EVA, approve on ops.
 * Requirements: FR-40, FR-44, NFR-04, NFR-05.
 * Implemented by TASK-24 (T24.06, Ridita Alam).
 */

import {
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { ContingencyOption, CrewId, Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { HoldToConfirm } from "../eva/HoldToConfirm";
import { StatusIcon } from "../components/statusIcon";

export interface OptionsProps {
  /** Optional Hab Core client instance for command dispatch. */
  client?: HabClient | null;
  /** Active crew identifier. */
  crewId?: CrewId;
  /** Direct Snapshot override. */
  snapshot?: Snapshot | null;
  /** Presentation variant: "eva" (bottom sheet) or "ops" (side panel). Defaults to "eva". */
  variant?: "eva" | "ops";
  /** Callback fired when an option is selected. */
  onSelectOption?: (option: ContingencyOption) => void;
  /** Callback fired to close sheet. */
  onClose?: () => void;
  className?: string;
}

const DEFAULT_OPTIONS: ContingencyOption[] = [
  {
    option_id: "opt-1",
    alert_id: "a-420",
    kind: "VEHICLE_RENDEZVOUS",
    crew_ids: ["EV1", "EV2"],
    eta_shelter_min: 14,
    expected_dose_ugy: 12,
    stops_dropped: [],
    violations: [],
    rank: 1,
    path_preview: [],
    rendezvous: { x_m: 0, y_m: 0, eta_crew_s: 840, eta_vehicle_s: 840 },
  },
  {
    option_id: "opt-2",
    alert_id: "a-420",
    kind: "ABORT_TO_HAB",
    crew_ids: ["EV1", "EV2"],
    eta_shelter_min: 41,
    expected_dose_ugy: 48,
    stops_dropped: [2, 3],
    violations: [],
    rank: 2,
    path_preview: [],
    rendezvous: null,
  },
];

const KIND_LABELS: Record<string, string> = {
  VEHICLE_RENDEZVOUS: "Vehicle rendezvous (PR1)",
  ABORT_TO_HAB: "Abort to habitat",
  TERRAIN_REFUGE: "Terrain refuge",
  CONTINUE_SKIP: "Continue with skipped stops",
};

/**
 * SCR-14 Alert Options Component (04 §E.7).
 * Renders ranked contingency options ordered 1–3 by the Hab Core simulation engine.
 * Never reorders options locally. Supports both EVA bottom-sheet and Ops side-panel variants.
 */
export function Options({
  client,
  crewId = "EV1",
  snapshot,
  variant = "eva",
  onSelectOption,
  onClose,
  className = "",
}: OptionsProps): ReactElement {
  const activeSnapshot = snapshot ?? client?.state() ?? null;
  const rawOptions = (activeSnapshot?.options && activeSnapshot.options.length > 0)
    ? activeSnapshot.options
    : DEFAULT_OPTIONS;

  // Options are kept strictly in server-provided rank order (04 §E.7)
  const options = [...rawOptions].sort((a, b) => a.rank - b.rank);

  // Top-ranked option is pre-selected (04 §E.7: "the top option pre-selected")
  const [selectedRank, setSelectedRank] = useState<number>(options[0]?.rank ?? 1);
  const selectedOption = options.find((o) => o.rank === selectedRank) ?? options[0];

  const isEva = variant === "eva";

  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-0, #0B0D10)",
    color: "var(--fg-1, #ECEFF2)",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    padding: isEva ? "16px" : "12px",
    gap: "12px",
    ...(isEva
      ? {
          // Bottom sheet covering 70% of screen on warning (04 §E.7)
          maxHeight: "70vh",
          borderTop: "3px solid var(--status-warning, #FF4D4D)",
          boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.7)",
        }
      : {
          border: "1px solid var(--control-edge, #5C6670)",
          height: "100%",
        }),
  };

  const handleConfirm = async () => {
    if (selectedOption) {
      if (client) {
        await client.send({
          kind: "APPROVE_OPTION",
          args: { option_id: selectedOption.option_id },
        });
      }
      onSelectOption?.(selectedOption);
      onClose?.();
    }
  };

  return (
    <div
      role="region"
      aria-label="Contingency options selection"
      data-screen="SCR-14"
      data-variant={variant}
      className={`scr14-options ${className}`}
      style={rootStyle}
    >
      {/* 1. Header: Alert Banner & Status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--hairline, #2A313A)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <StatusIcon status="warning" showWord={false} />
          <span style={{ fontWeight: 700, fontSize: "18px", textTransform: "uppercase" }}>
            CONTINGENCY OPTIONS — SELECT RESPONSE
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            className="btn"
            style={{ minHeight: "44px", minWidth: "44px", cursor: "pointer" }}
            onClick={onClose}
            aria-label="Close options sheet"
          >
            ✕
          </button>
        )}
      </div>

      {/* 2. Ops Reviewing Indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 10px",
          background: "var(--surface-2, #1C2128)",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "12px",
          color: "var(--text-2, #A9B3BE)",
        }}
      >
        <StatusIcon status="advisory" showWord={false} />
        <span>Ops review active · Recommended option pre-selected</span>
      </div>

      {/* 3. Ranked Options List (1–3) */}
      <div
        role="radiogroup"
        aria-label="Ranked evacuation options"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          overflowY: "auto",
        }}
      >
        {options.map((opt) => {
          const isSelected = opt.rank === selectedRank;
          return (
            <div
              key={opt.option_id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => setSelectedRank(opt.rank)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  setSelectedRank(opt.rank);
                }
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "12px 14px",
                background: isSelected ? "var(--surface-2, #1C2128)" : "var(--surface-1, #14181D)",
                border: isSelected
                  ? "2px solid var(--status-nominal, #3DDC84)"
                  : "1px solid var(--control-edge, #5C6670)",
                cursor: "pointer",
                gap: "6px",
                minHeight: "56px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: 700,
                      fontSize: "14px",
                      padding: "2px 6px",
                      background: isSelected ? "var(--status-nominal, #3DDC84)" : "var(--raised, #1C2128)",
                      color: isSelected ? "#000000" : "var(--text-1, #ECEFF2)",
                    }}
                  >
                    RANK {opt.rank}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: "15px" }}>
                    {KIND_LABELS[opt.kind] ?? opt.kind}
                  </span>
                </div>
                <span
                  className="value"
                  data-provenance="modelled"
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "var(--text-1, #ECEFF2)",
                  }}
                >
                  {opt.eta_shelter_min} MIN ○
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "13px",
                  color: "var(--text-2, #A9B3BE)",
                }}
              >
                <span>DOSE {opt.expected_dose_ugy} µGy ○</span>
                <span>·</span>
                <span>
                  DROPS {opt.stops_dropped.length > 0 ? `STOPS ${opt.stops_dropped.join(", ")}` : "0 STOPS"}
                </span>
                {opt.violations.length > 0 && (
                  <span style={{ color: "var(--status-warning, #FF4D4D)" }}>
                    {opt.violations.join(", ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Action Footer: Hold-to-confirm Button (800 ms hold) */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: "10px",
          borderTop: "1px solid var(--hairline, #2A313A)",
        }}
      >
        <HoldToConfirm
          id="action-confirm-option"
          data-hold-key="confirm-option"
          label={selectedOption ? `Go — Option ${selectedOption.rank}` : "Confirm option"}
          outcome={selectedOption ? `Option ${selectedOption.rank} approved — executing` : "Executing option"}
          kind="warning"
          holdDurationMs={800}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  );
}
