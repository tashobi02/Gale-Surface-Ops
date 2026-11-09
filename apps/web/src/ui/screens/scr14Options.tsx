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
import { HoldToConfirm, type ConfirmOutcome } from "../eva/HoldToConfirm";
import { selectMetadataStrip } from "../eva/viewModel";
import { StatusIcon } from "../components/statusIcon";
import { PROVENANCE_GLYPHS, UNAVAILABLE, fmtInt, isFiniteNumber, provAttrs, unavailableOf } from "../components/provenance";

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

/** Option ETA and dose are modelled by the contingency engine (05); a non-finite one reads "—", flagged unavailable. */
function optionAttrs(v: unknown, field: string): ReturnType<typeof provAttrs> {
  return provAttrs(
    isFiniteNumber(v)
      ? { prov: "modelled", src: `snapshot:options.${field}` }
      : unavailableOf("modelled", `options.${field}`),
  );
}

const KIND_LABELS: Record<string, string> = {
  VEHICLE_RENDEZVOUS: "Vehicle rendezvous",
  ABORT_TO_HAB: "Abort to habitat",
  TERRAIN_REFUGE: "Terrain refuge",
  CONTINUE_SKIP: "Continue with skipped stops",
};

/** The Hab Core command that executes an option for the acting role, or why this role cannot send one. */
export type OptionCommand =
  | { supported: true; kind: "APPROVE_OPTION" | "SUMMON_VEHICLE" | "ABORT"; args: Record<string, unknown> }
  | { supported: false; reason: string };

/**
 * Maps a selected option to the command the acting role is allowed to send (02 §E.4, PERMISSIONS).
 * Ops approves with APPROVE_OPTION. An EVA role may only SUMMON_VEHICLE or ABORT, for a crew list that
 * includes itself; CONTINUE_SKIP needs ops approval and is not available to EVA.
 * TODO(decision): define authorized EVA handling for unsupported option kinds; CONTINUE_SKIP requires ops
 * approval. Unsupported EVA actions remain disabled.
 */
export function commandForOption(variant: "eva" | "ops", option: ContingencyOption, crewId: CrewId): OptionCommand {
  if (variant === "ops") {
    return { supported: true, kind: "APPROVE_OPTION", args: { option_id: option.option_id } };
  }
  if (!option.crew_ids.includes(crewId)) {
    return { supported: false, reason: `Option does not cover ${crewId}` };
  }
  switch (option.kind) {
    case "VEHICLE_RENDEZVOUS":
      return { supported: true, kind: "SUMMON_VEHICLE", args: { crew: [...option.crew_ids], option_id: option.option_id } };
    case "ABORT_TO_HAB":
      return { supported: true, kind: "ABORT", args: { crew: [...option.crew_ids] } };
    default:
      return { supported: false, reason: "Needs ops approval" };
  }
}

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
  // No sample options: when the Hab Core has proposed none the sheet says so and cannot confirm anything.
  const rawOptions = activeSnapshot?.options ?? [];

  // Options are kept strictly in server-provided rank order (04 §E.7)
  const options = [...rawOptions].sort((a, b) => a.rank - b.rank);

  // Top-ranked option is pre-selected (04 §E.7: "the top option pre-selected")
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const selectedOption = options.find((o) => o.rank === selectedRank) ?? options[0];

  const isEva = variant === "eva";
  const linked = selectMetadataStrip(activeSnapshot, crewId).link.linked;
  const command = selectedOption ? commandForOption(variant, selectedOption, crewId) : null;
  const missing = !client ? "No Hab Core connection" : !selectedOption ? "No option proposed" : command && !command.supported ? command.reason : undefined;

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

  // Sends the one command for the selected option. The sheet closes and callbacks fire only when the Hab Core
  // accepted it; a rejection is shown on the button and the sheet stays open.
  const handleConfirm = async (): Promise<ConfirmOutcome> => {
    if (!client || !selectedOption || !command) return { ok: false, message: missing };
    if (!command.supported) return { ok: false, message: command.reason };
    const result = await client.send({ kind: command.kind, args: command.args });
    if (result.ok) {
      onSelectOption?.(selectedOption);
      onClose?.();
    }
    return result;
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
          <StatusIcon status="warning" showWord={true} />
          <span style={{ fontWeight: 700, fontSize: "18px", textTransform: "uppercase" }}>
            CONTINGENCY OPTIONS — SELECT RESPONSE
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            className="btn"
            style={{ minHeight: "56px", minWidth: "56px", cursor: "pointer", fontSize: "16px" }}
            onClick={onClose}
            aria-label="Close options sheet"
          >
            ✕
          </button>
        )}
      </div>

      {/* 2. Pre-selection note (04 §E.7: the top option is pre-selected) */}
      {options.length > 0 && (
        <div
          style={{
            padding: "6px 10px",
            background: "var(--surface-2, #1C2128)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "16px",
            color: "var(--text-2, #A9B3BE)",
          }}
        >
          Recommended option pre-selected
        </div>
      )}

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
        {options.length === 0 && (
          <div
            data-slot="options-empty"
            style={{
              padding: "12px 14px",
              border: "1px dashed var(--control-edge, #5C6670)",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "16px",
              color: "var(--text-2, #A9B3BE)",
            }}
          >
            {UNAVAILABLE} No options proposed yet — the Hab Core is computing them
          </div>
        )}
        {options.map((opt) => {
          const isSelected = opt.option_id === selectedOption?.option_id;
          // Selection is neutral chrome (04 §A.3: status colours mean status only).
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
                  ? "3px solid var(--text-1, #ECEFF2)"
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
                      fontSize: "16px",
                      padding: "2px 6px",
                      background: isSelected ? "var(--text-1, #ECEFF2)" : "var(--raised, #1C2128)",
                      color: isSelected ? "#000000" : "var(--text-1, #ECEFF2)",
                    }}
                  >
                    {isSelected ? "▣ " : ""}RANK {opt.rank}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: "16px" }}>
                    {KIND_LABELS[opt.kind] ?? opt.kind}
                  </span>
                </div>
                <span
                  className="value"
                  {...optionAttrs(opt.eta_shelter_min, "eta_shelter_min")}
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "var(--text-1, #ECEFF2)",
                  }}
                >
                  {fmtInt(opt.eta_shelter_min)} MIN {isFiniteNumber(opt.eta_shelter_min) ? PROVENANCE_GLYPHS.modelled : ""}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "16px",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "16px",
                  color: "var(--text-2, #A9B3BE)",
                }}
              >
                <span {...optionAttrs(opt.expected_dose_ugy, "expected_dose_ugy")}>
                  DOSE {fmtInt(opt.expected_dose_ugy)} µGy {isFiniteNumber(opt.expected_dose_ugy) ? PROVENANCE_GLYPHS.modelled : ""}
                </span>
                <span>·</span>
                <span
                  data-provenance="modelled"
                  data-source="snapshot:options.stops_dropped"
                  title="snapshot:options.stops_dropped"
                >
                  DROPS {opt.stops_dropped.length > 0 ? `STOPS ${opt.stops_dropped.join(", ")}` : "0 STOPS"}{" "}
                  {PROVENANCE_GLYPHS.modelled}
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
          outcome={selectedOption ? `Option ${selectedOption.rank} accepted` : "Accepted"}
          queued={isEva && linked === false}
          kind="warning"
          holdDurationMs={800}
          disabled={missing !== undefined}
          disabledReason={missing}
          onConfirm={handleConfirm}
        />
      </div>
    </div>
  );
}
