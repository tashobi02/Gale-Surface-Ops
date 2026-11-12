/**
 * ConditionsPanel — Ops conditions panel and EVA conditions strip values (01 FR-36, 04 §E.4, §E.5).
 * Implementation: T25.10 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Requirements:
 * - FR-36: Local solar time (LTST), sun elevation, background dose rate, current event dose rate
 *   (during replay), Earth link status, and REMS status ("not included in this build" if unbuilt).
 * - FR-36 & NFR-05: Every value shows its provenance class ({ v, unit, prov, src }) and data-provenance attribute.
 * - Non-negotiable: Nothing is labelled "live".
 * - No sample values: a field the Hab Core has not supplied renders "—" (04 §D.1), flagged `data-unavailable="true"`
 *   with an `unavailable:` source, no provenance class (it is not known for a missing value) and no glyph.
 *   Supplied provenance and source ids are carried through untouched, one set per element.
 * - Supports two variants:
 *   - "ops" (default): full panel layout for SCR-11 right column.
 *   - "eva": compact strip format for SCR-12 metadata strip.
 */

import type { CSSProperties, ReactElement } from "react";
import type { Provenance } from "@marswalk/protocol";
import { PROVENANCE_GLYPHS, UNAVAILABLE, fmtFixed, fmtInt, isFiniteNumber, isUsableValue, provAttrs, unavailableOf } from "../components/provenance";

export interface ProvenanceValue<T> {
  v: T;
  unit?: string;
  prov: Provenance;
  src: string;
}

export interface EarthLinkConditions {
  lightTimeSeconds: ProvenanceValue<number>;
  nextPass: ProvenanceValue<string>;
  queueUp: ProvenanceValue<number>;
  queueDown: ProvenanceValue<number>;
}

export interface ConditionsState {
  ltst: ProvenanceValue<string>;
  sunElevationDeg: ProvenanceValue<number>;
  doseRateBackgroundUgyH: ProvenanceValue<number>;
  doseRateEventUgyH?: ProvenanceValue<number>;
  earthLink?: EarthLinkConditions;
  remsClimatology?: {
    available: boolean;
    note: string;
  };
}

export interface ConditionsPanelProps {
  showEarthLink?: boolean;
  variant?: "ops" | "eva";
  conditions?: Partial<ConditionsState>;
  className?: string;
}

const REMS_NOT_BUILT_NOTE = "not included in this build";

function formatLightTime(seconds: number): string {
  if (!isFiniteNumber(seconds) || seconds < 0) return UNAVAILABLE;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** One rendered condition: the text, and the provenance attributes of the value element. */
interface Cell {
  text: string;
  attrs: ReturnType<typeof provAttrs>;
}

/** A supplied value formatted for display, or an unavailable cell when the field is missing. */
function cell<T>(pv: ProvenanceValue<T> | undefined, path: string, fmt: (v: T, unit: string) => string): Cell {
  // A supplied value that is empty, blank, null or non-finite is unavailable, like a missing one.
  if (!pv || !isUsableValue(pv.v)) {
    return { text: UNAVAILABLE, attrs: provAttrs(unavailableOf(null, `conditions.${path}`)) };
  }
  return {
    text: `${fmt(pv.v, pv.unit ?? "")} ${PROVENANCE_GLYPHS[pv.prov]}`,
    attrs: provAttrs({ prov: pv.prov, src: pv.src }),
  };
}

const num = (digits: number) => (v: number, unit: string): string =>
  isFiniteNumber(v) ? `${digits === 0 ? fmtInt(v) : fmtFixed(v, digits)}${unit ? ` ${unit}` : ""}` : UNAVAILABLE;
const numTight = (v: number, unit: string): string => (isFiniteNumber(v) ? `${v}${unit}` : UNAVAILABLE);
const plain = (v: string): string => (typeof v === "string" && v.length > 0 ? v : UNAVAILABLE);

export function ConditionsPanel({
  showEarthLink = true,
  variant = "ops",
  conditions = {},
  className = "",
}: ConditionsPanelProps): ReactElement {
  const ltst = cell(conditions.ltst, "ltst", plain);
  const sun = cell(conditions.sunElevationDeg, "sunElevationDeg", numTight);
  const background = cell(conditions.doseRateBackgroundUgyH, "doseRateBackgroundUgyH", (v, u) => num(2)(v, u));
  const event = conditions.doseRateEventUgyH ? cell(conditions.doseRateEventUgyH, "doseRateEventUgyH", (v, u) => num(1)(v, u)) : null;
  const light = cell(conditions.earthLink?.lightTimeSeconds, "earthLink.lightTimeSeconds", (v) => formatLightTime(v));
  const nextPass = cell(conditions.earthLink?.nextPass, "earthLink.nextPass", plain);
  const queueUp = conditions.earthLink?.queueUp;
  const queueDown = conditions.earthLink?.queueDown;
  // Relay queue: uplink and downlink are two sourced values; each is its own element with its own source and class.
  const queueUpCell = cell(queueUp, "earthLink.queueUp", (v) => `↑${isFiniteNumber(v) ? v : UNAVAILABLE}`);
  const queueDownCell = cell(queueDown, "earthLink.queueDown", (v) => `↓${isFiniteNumber(v) ? v : UNAVAILABLE}`);
  const remsNote = conditions.remsClimatology?.note ?? REMS_NOT_BUILT_NOTE;

  const cardStyle: CSSProperties = {
    backgroundColor: "var(--raised, #1C2128)",
    border: "1px solid var(--edge, #5C6670)",
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "12px",
    color: "var(--text-1, #ECEFF2)",
  };

  const rowStyle: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const labelStyle: CSSProperties = {
    color: "var(--text-2, #A9B3BE)",
    textTransform: "uppercase",
    fontSize: "12px",
    letterSpacing: "0.04em",
  };

  const valStyle: CSSProperties = {
    fontVariantNumeric: "tabular-nums",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  };

  if (variant === "eva") {
    // Compact inline strip for SCR-12 EVA tablet metadata (EVA text is at least 16 px)
    return (
      <div
        className={`conditions-strip-eva ${className}`}
        data-testid="conditions-strip-eva"
        data-surface="eva"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
          fontSize: "16px",
          color: "var(--text-2, #A9B3BE)",
          overflowX: "auto",
        }}
      >
        <span {...ltst.attrs} style={valStyle}>LTST {ltst.text}</span>
        <span {...sun.attrs} style={valStyle}>SUN {sun.text}</span>
        <span {...background.attrs} style={valStyle}>BG {background.text}</span>
        {event && (
          <span {...event.attrs} style={{ ...valStyle, fontWeight: 700 }}>
            EVENT {event.text}
          </span>
        )}
        <span {...light.attrs} style={valStyle}>EARTH {light.text}</span>
      </div>
    );
  }

  // Default ops layout (SCR-11 right column)
  return (
    <div
      className={`conditions-panel-ops ${className}`}
      data-testid="conditions-panel"
      data-surface="ops"
      style={{ display: "flex", flexDirection: "column", gap: "12px" }}
    >
      {/* Environment & Space Weather Card */}
      <div style={cardStyle}>
        <div style={rowStyle}>
          <span style={labelStyle}>LTST</span>
          <span className="value" {...ltst.attrs} style={valStyle}>{ltst.text}</span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Sun Elevation</span>
          <span className="value" {...sun.attrs} style={valStyle}>{sun.text}</span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Background Dose</span>
          <span className="value" {...background.attrs} style={valStyle}>{background.text}</span>
        </div>

        {event && (
          <div style={rowStyle}>
            <span style={labelStyle}>Event Dose Rate</span>
            <span className="value" {...event.attrs} style={{ ...valStyle, fontWeight: 700 }}>
              {event.text}
            </span>
          </div>
        )}

        <div style={{ ...rowStyle, borderTop: "1px solid var(--edge, #5C6670)", paddingTop: "4px", marginTop: "2px" }}>
          <span style={labelStyle}>REMS Weather</span>
          {/* A status note (FR-36: "not included in this build"), not a value: flagged unavailable, no class, no glyph */}
          <span
            {...provAttrs(unavailableOf(null, "conditions.remsClimatology"))}
            data-source="docs/specs/01:FR-36"
            title="docs/specs/01:FR-36"
            style={{ color: "var(--text-3)", fontSize: "12px" }}
          >
            {remsNote}
          </span>
        </div>
      </div>

      {/* Earth Link Card: rows stay in place and read "—" until the Hab Core supplies them */}
      {showEarthLink && <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div
          className="module-label"
          style={{
            fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
            fontSize: "12px",
            color: "var(--text-2, #A9B3BE)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          [ ORBITAL /// EARTH LINK ]
        </div>
        <div style={cardStyle} data-testid="earth-link-subpanel">
          <div style={rowStyle}>
            <span style={labelStyle}>Light Time</span>
            <span className="value" {...light.attrs} style={valStyle}>{light.text}</span>
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>Next Pass</span>
            <span className="value" {...nextPass.attrs} style={valStyle}>{nextPass.text}</span>
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>Relay Queue</span>
            <span style={valStyle}>
              <span className="value" data-queue="up" {...queueUpCell.attrs}>{queueUpCell.text}</span>
              <span className="value" data-queue="down" {...queueDownCell.attrs}>{queueDownCell.text}</span>
            </span>
          </div>
        </div>
      </div>}
    </div>
  );
}
