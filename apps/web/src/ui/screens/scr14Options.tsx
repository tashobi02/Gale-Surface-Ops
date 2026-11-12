/**
 * SCR-14 — Options sheet (EVA) / options panel (ops) (docs/specs/03 §B; layout in docs/specs/04 §E.7; mode OPS, 04 §B.2).
 * Purpose: Ranked contingency options with ETA, expected dose and dropped stops; hold-to-confirm on EVA, approve on ops.
 * Requirements: FR-40, FR-44, NFR-04, NFR-05.
 * Implemented by TASK-24 (T24.06, Ridita Alam).
 */

import {
  useRef,
  useEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import type { ContingencyOption, CrewId, LogEvent, Provenance, Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { useCommand, useEvents, useHabClient, useSnapshot } from "../../state/habSession";
import { HoldToConfirm, type ConfirmOutcome } from "../eva/HoldToConfirm";
import { isProvenance, selectMetadataStrip } from "../eva/viewModel";
import { StatusIcon } from "../components/statusIcon";
import { UNAVAILABLE, fmtInt, glyphOf, isFiniteNumber, provAttrs, unavailableOf } from "../components/provenance";

interface OptionsCommonProps {
  /** Hab Core client for command dispatch; omitted means the tab's session (state/habSession.ts), null means none. */
  client?: HabClient | null;
  /** Direct Snapshot override. */
  snapshot?: Snapshot | null;
  /** Callback fired when an option is selected. */
  onSelectOption?: (option: ContingencyOption) => void;
  /** Selection preview, before approval; null removes a superseded path. */
  onPreviewOption?: (option: ContingencyOption | null) => void;
  /** Callback fired to close sheet. */
  onClose?: () => void;
  className?: string;
}

/**
 * The EVA bottom sheet acts for one crew member, so `crewId` is required there (there is no default crew member); the
 * ops side panel acts for no crew member and ignores a `crewId` it is given (OptionsPanel still passes one).
 */
export type OptionsProps = OptionsCommonProps &
  ({ variant?: "eva"; crewId: CrewId } | { variant: "ops"; crewId?: CrewId });

/** The class 05 ContingencyOption gives a field when the Hab Core's event does not name one; 05 gives `stops_dropped` none. */
const OPTION_FIELD_CLASS: Record<string, Provenance | undefined> = {
  eta_shelter_min: "modelled",
  expected_dose_ugy: "modelled",
};

/**
 * The class the Hab Core gave an option field: the provenance of the newest OPTIONS_PROPOSED event for the option's alert
 * (the key is spelled as in 05 §F.6, `data.options[].<field>`, which the Hab Core writes; no other spelling is read).
 * Null when no such event is in the store or it names no valid class.
 * TODO(decision): 05 gives `stops_dropped` no class, so it shows none.
 */
function eventClass(events: LogEvent[], option: ContingencyOption, field: string): Provenance | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.kind !== "OPTIONS_PROPOSED" || event.data.alert_id !== option.alert_id) continue;
    const given: unknown = event.provenance?.[`data.options[].${field}`];
    return isProvenance(given) ? given : null;
  }
  return null;
}

/** Label for an option value: the Hab Core's class (else 05's); a non-finite value reads "—", flagged unavailable. */
function optionAttrs(events: LogEvent[], option: ContingencyOption, field: string, v: unknown): { attrs: ReturnType<typeof provAttrs>; glyph: string } {
  const prov = eventClass(events, option, field) ?? OPTION_FIELD_CLASS[field] ?? null;
  const sourced = isFiniteNumber(v) ? { prov, src: `snapshot:options.${field}` } : unavailableOf(prov, `options.${field}`);
  return { attrs: provAttrs(sourced), glyph: glyphOf(sourced) };
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
export function commandForOption(variant: "eva" | "ops", option: ContingencyOption, crewId: CrewId | undefined): OptionCommand {
  if (variant === "ops") {
    return { supported: true, kind: "APPROVE_OPTION", args: { option_id: option.option_id } };
  }
  if (!crewId) return { supported: false, reason: "Crew not identified" };
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
  crewId,
  snapshot,
  variant = "eva",
  onSelectOption,
  onPreviewOption,
  onClose,
  className = "",
}: OptionsProps): ReactElement {
  const hab = useHabClient(client);
  const send = useCommand(client);
  const stored = useSnapshot(client);
  const events = useEvents(client);
  const activeSnapshot = snapshot === undefined ? stored : snapshot;
  // No sample options: when the Hab Core has proposed none the sheet says so and cannot confirm anything.
  const rawOptions = activeSnapshot?.options ?? [];

  // Options are kept strictly in server-provided rank order (04 §E.7)
  const options = [...rawOptions].sort((a, b) => a.rank - b.rank);

  // Top-ranked option is pre-selected (04 §E.7: "the top option pre-selected"). A choice belongs to the proposal it was
  // made on: a new proposal (other alert or other option ids) starts again at the top option.
  const proposalKey = options.map((o) => `${o.alert_id}/${o.option_id}`).join("|");
  const [choice, setChoice] = useState<{ key: string; rank: number } | null>(null);
  const selectedRank = choice && choice.key === proposalKey ? choice.rank : null;
  const selectedOption = options.find((o) => o.rank === selectedRank) ?? options[0];
  useEffect(() => { onPreviewOption?.(selectedOption ?? null); }, [selectedOption, onPreviewOption]);
  const radioRefs = useRef<(HTMLDivElement | null)[]>([]);

  const choose = (index: number): void => {
    const target = options[index];
    if (!target) return;
    setChoice({ key: proposalKey, rank: target.rank });
    radioRefs.current[index]?.focus();
  };

  // Radio group keys: arrows move the choice (wrapping), Home and End jump, Space and Enter choose the focused radio.
  const onRadioKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number): void => {
    const last = options.length - 1;
    const next: Record<string, number> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowRight: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
      " ": index,
      Enter: index,
    };
    if (!(e.key in next)) return;
    e.preventDefault();
    choose(next[e.key]);
  };

  const isEva = variant === "eva";
  const linked = isEva && crewId ? selectMetadataStrip(activeSnapshot, crewId).link.linked : null;
  const command = selectedOption ? commandForOption(variant, selectedOption, crewId) : null;
  const missing = !hab ? "No Hab Core connection" : !selectedOption ? "No option proposed" : command && !command.supported ? command.reason : undefined;

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
    if (!hab || !selectedOption || !command) return { ok: false, message: missing };
    if (!command.supported) return { ok: false, message: command.reason };
    const result = await send({ kind: command.kind, args: command.args });
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
        {options.map((opt, index) => {
          const isSelected = opt.option_id === selectedOption?.option_id;
          const eta = optionAttrs(events, opt, "eta_shelter_min", opt.eta_shelter_min);
          const dose = optionAttrs(events, opt, "expected_dose_ugy", opt.expected_dose_ugy);
          const drops = optionAttrs(events, opt, "stops_dropped", opt.stops_dropped.length);
          // Selection is neutral chrome (04 §A.3: status colours mean status only).
          return (
            <div
              key={opt.option_id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              ref={(el) => {
                radioRefs.current[index] = el;
              }}
              onClick={() => choose(index)}
              onKeyDown={(e) => onRadioKeyDown(e, index)}
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
                    <span data-provenance="simulated" data-source="snapshot:options.rank">{isSelected ? "▣ " : ""}RANK {opt.rank}</span>
                  </span>
                  <span style={{ fontWeight: 600, fontSize: "16px" }}>
                    {KIND_LABELS[opt.kind] ?? opt.kind}
                  </span>
                </div>
                <span
                  className="value"
                  {...eta.attrs}
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "var(--text-1, #ECEFF2)",
                  }}
                >
                  {fmtInt(opt.eta_shelter_min)} MIN {eta.glyph}
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
                <span {...dose.attrs}>
                  DOSE {fmtInt(opt.expected_dose_ugy)} µGy {dose.glyph}
                </span>
                <span>·</span>
                <span {...drops.attrs}>
                  DROPS {opt.stops_dropped.length > 0 ? `STOPS ${opt.stops_dropped.join(", ")}` : "0 STOPS"}
                  {drops.glyph ? ` ${drops.glyph}` : ""}
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
          label={selectedOption ? isEva ? `Go — Option ${selectedOption.rank}` : `Approve option ${selectedOption.rank}` : "Confirm option"}
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
