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
  /** Direct options array override (strictly from server OPTIONS_PROPOSED; zero defaults). */
  options?: ContingencyOption[];
  /** Whether Ops review is currently active (04 §E.7: only show indicator if true). */
  opsReviewActive?: boolean;
  /** Presentation variant: "eva" (bottom sheet) or "ops" (side panel). Defaults to "eva". */
  variant?: "eva" | "ops";
  /** Callback fired when an option is selected. */
  onSelectOption?: (option: ContingencyOption) => void;
  /** Callback fired to close sheet. */
  onClose?: () => void;
  className?: string;
}

const KIND_LABELS: Record<string, string> = {
  VEHICLE_RENDEZVOUS: "Vehicle rendezvous",
  ABORT_TO_HAB: "Abort to habitat",
  TERRAIN_REFUGE: "Terrain refuge",
  CONTINUE_SKIP: "Continue with skipped stops",
};

/**
 * SCR-14 Alert Options Component (04 §E.7).
 * Renders ranked contingency options ordered 1–3 by the Hab Core simulation engine.
 * Never invents options locally (zero default options).
 * Supports both EVA bottom-sheet and Ops side-panel variants.
 */
export function Options({
  client,
  crewId = "EV1",
  snapshot,
  options: optionsProp,
  opsReviewActive: opsReviewActiveProp,
  variant = "eva",
  onSelectOption,
  onClose,
  className = "",
}: OptionsProps): ReactElement {
  const activeSnapshot = snapshot ?? client?.state() ?? null;

  // Options come strictly from OPTIONS_PROPOSED via snapshot or explicit prop (zero invented defaults)
  const rawOptions = optionsProp ?? activeSnapshot?.options ?? [];

  // Options are kept in server-assigned rank order 1–3 (04 §E.7)
  const options = [...rawOptions].sort((a, b) => a.rank - b.rank);

  // Top-ranked option (rank 1) is pre-selected (04 §E.7: "the top option pre-selected")
  const serverFirstOption = options.find((o) => o.rank === 1) ?? options[0] ?? null;
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(serverFirstOption?.option_id ?? null);

  const selectedOption = options.find((o) => o.option_id === selectedOptionId) ?? serverFirstOption;

  // Only show "Ops review active" when ops review is actually true (04 §E.7)
  const isOpsReviewActive = Boolean(opsReviewActiveProp);

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

  const handleConfirm = async (): Promise<unknown> => {
    if (!selectedOption) return;
    if (client) {
      const res = await client.send({
        kind: "APPROVE_OPTION",
        args: { option_id: selectedOption.option_id },
      });
      if (!res.ok && res.code !== "NO_LINK") {
        throw new Error(res.message || "Failed to approve option");
      }
      onSelectOption?.(selectedOption);
      onClose?.();
      return res;
    }
    onSelectOption?.(selectedOption);
    onClose?.();
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
      {/* 1. Header: Alert Banner & Status (4-cue accessible indicator) */}
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
          <StatusIcon status="warning" showWord={true} />
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

      {/* 2. Ops Reviewing Indicator (rendered ONLY when ops review is actively true) */}
      {isOpsReviewActive && (
        <div
          data-slot="ops-review-banner"
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
          <StatusIcon status="advisory" showWord={true} />
          <span>Ops review active · Recommended option pre-selected</span>
        </div>
      )}

      {/* 3. Ranked Options List (1–3) or Empty State */}
      {options.length === 0 ? (
        <div
          data-slot="options-empty"
          style={{
            padding: "24px 16px",
            textAlign: "center",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "14px",
            color: "var(--text-2, #A9B3BE)",
            backgroundColor: "var(--surface-1, #14181D)",
            border: "1px dashed var(--control-edge, #5C6670)",
          }}
        >
          No contingency options proposed
        </div>
      ) : (
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
            const isSelected = opt.option_id === selectedOption?.option_id;
            return (
              <div
                key={opt.option_id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => setSelectedOptionId(opt.option_id)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setSelectedOptionId(opt.option_id);
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
                    data-src="compute/contingency"
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
                  <span data-provenance="modelled" data-src="compute/eventDose">
                    DOSE {opt.expected_dose_ugy} µGy ○
                  </span>
                  <span>·</span>
                  <span data-provenance="derived" data-src="compute/contingency">
                    DROPS {opt.stops_dropped.length > 0 ? `STOPS ${opt.stops_dropped.join(", ")}` : "0 STOPS"}
                  </span>
                  {opt.violations.length > 0 && (
                    <span style={{ color: "var(--status-warning, #FF4D4D)" }}>
                      <StatusIcon status="warning" showWord={true} /> {opt.violations.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          label={selectedOption ? `Go — Option ${selectedOption.rank}` : "No option available"}
          outcome={selectedOption ? `Option ${selectedOption.rank} approved — executing` : ""}
          kind="warning"
          holdDurationMs={800}
          disabled={!selectedOption}
          disabledReason={!selectedOption ? "No contingency option available to approve" : undefined}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  );
}
