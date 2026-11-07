/**
 * ConditionsPanel — Ops conditions panel and EVA conditions strip values (01 FR-36, 04 §E.4, §E.5).
 * Implementation: T25.10 (Ridita Alam, R5 EVA & Ops UI).
 *
 * Requirements:
 * - FR-36: Local solar time (LTST), sun elevation, background dose rate, current event dose rate
 *   (during replay), Earth link status, and REMS status ("not included in this build" if unbuilt).
 * - FR-36 & NFR-05: Every value shows its provenance class ({ v, unit, prov, src }) and data-provenance attribute.
 * - Non-negotiable: Nothing is labelled "live".
 * - Supports two variants:
 *   - "ops" (default): full panel layout for SCR-11 right column.
 *   - "eva": compact strip format for SCR-12 metadata strip.
 */

import type { CSSProperties, ReactElement } from "react";
import type { Provenance } from "@marswalk/protocol";

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
  variant?: "ops" | "eva";
  conditions?: Partial<ConditionsState>;
  className?: string;
}

const PROVENANCE_GLYPHS: Record<Provenance, string> = {
  measured: "■",
  derived: "◆",
  modelled: "○",
  assumed: "△",
  replayed: "▶",
  simulated: "◇",
};

const DEFAULT_CONDITIONS: ConditionsState = {
  ltst: {
    v: "13:05",
    unit: "LTST",
    prov: "modelled",
    src: "Mars24-Gale-West-Lon",
  },
  sunElevationDeg: {
    v: 42.5,
    unit: "°",
    prov: "modelled",
    src: "Mars24-Solar-Position",
  },
  doseRateBackgroundUgyH: {
    v: 0.21,
    unit: "µGy/h",
    prov: "replayed",
    src: "MSL-RAD-Gale",
  },
  doseRateEventUgyH: {
    v: 84.2,
    unit: "µGy/h",
    prov: "replayed",
    src: "MSL-RAD-20240520",
  },
  earthLink: {
    lightTimeSeconds: {
      v: 842, // 14 min 02 s
      unit: "s",
      prov: "derived",
      src: "SPICE-de440",
    },
    nextPass: {
      v: "MRO 9m",
      unit: "",
      prov: "derived",
      src: "MRO-Orbit-Pass-Predict",
    },
    queueUp: {
      v: 1,
      unit: "pkts",
      prov: "derived",
      src: "Orbital-Relay-Queue",
    },
    queueDown: {
      v: 0,
      unit: "pkts",
      prov: "derived",
      src: "Orbital-Relay-Queue",
    },
  },
  remsClimatology: {
    available: false,
    note: "not included in this build",
  },
};

function formatLightTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ConditionsPanel({
  variant = "ops",
  conditions = {},
  className = "",
}: ConditionsPanelProps): ReactElement {
  const state: ConditionsState = {
    ...DEFAULT_CONDITIONS,
    ...conditions,
    earthLink: {
      ...DEFAULT_CONDITIONS.earthLink!,
      ...conditions.earthLink,
    },
    remsClimatology: {
      ...DEFAULT_CONDITIONS.remsClimatology!,
      ...conditions.remsClimatology,
    },
  };

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
    fontSize: "11px",
    letterSpacing: "0.04em",
  };

  const valStyle: CSSProperties = {
    fontVariantNumeric: "tabular-nums",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  };

  if (variant === "eva") {
    // Compact inline strip for SCR-12 EVA tablet metadata
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
          fontSize: "11px",
          color: "var(--text-2, #A9B3BE)",
          overflowX: "auto",
        }}
      >
        <span
          data-provenance={state.ltst.prov}
          data-source={state.ltst.src}
          style={valStyle}
        >
          LTST {state.ltst.v} {PROVENANCE_GLYPHS[state.ltst.prov]}
        </span>
        <span
          data-provenance={state.sunElevationDeg.prov}
          data-source={state.sunElevationDeg.src}
          style={valStyle}
        >
          SUN {state.sunElevationDeg.v}{state.sunElevationDeg.unit} {PROVENANCE_GLYPHS[state.sunElevationDeg.prov]}
        </span>
        <span
          data-provenance={state.doseRateBackgroundUgyH.prov}
          data-source={state.doseRateBackgroundUgyH.src}
          style={valStyle}
        >
          BG {state.doseRateBackgroundUgyH.v} {state.doseRateBackgroundUgyH.unit} {PROVENANCE_GLYPHS[state.doseRateBackgroundUgyH.prov]}
        </span>
        {state.doseRateEventUgyH !== undefined && (
          <span
            data-provenance={state.doseRateEventUgyH.prov}
            data-source={state.doseRateEventUgyH.src}
            style={{
              ...valStyle,
              color: "var(--status-warning, #FF453A)",
              fontWeight: 700,
            }}
          >
            EVENT {state.doseRateEventUgyH.v} {state.doseRateEventUgyH.unit} {PROVENANCE_GLYPHS[state.doseRateEventUgyH.prov]}
          </span>
        )}
        {state.earthLink && (
          <span
            data-provenance={state.earthLink.lightTimeSeconds.prov}
            data-source={state.earthLink.lightTimeSeconds.src}
            style={valStyle}
          >
            EARTH {formatLightTime(state.earthLink.lightTimeSeconds.v)} {PROVENANCE_GLYPHS[state.earthLink.lightTimeSeconds.prov]}
          </span>
        )}
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
          <span
            className="value"
            data-provenance={state.ltst.prov}
            data-source={state.ltst.src}
            style={valStyle}
          >
            {state.ltst.v} {PROVENANCE_GLYPHS[state.ltst.prov]}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Sun Elevation</span>
          <span
            className="value"
            data-provenance={state.sunElevationDeg.prov}
            data-source={state.sunElevationDeg.src}
            style={valStyle}
          >
            {state.sunElevationDeg.v}{state.sunElevationDeg.unit} {PROVENANCE_GLYPHS[state.sunElevationDeg.prov]}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Background Dose</span>
          <span
            className="value"
            data-provenance={state.doseRateBackgroundUgyH.prov}
            data-source={state.doseRateBackgroundUgyH.src}
            style={valStyle}
          >
            {state.doseRateBackgroundUgyH.v} {state.doseRateBackgroundUgyH.unit} {PROVENANCE_GLYPHS[state.doseRateBackgroundUgyH.prov]}
          </span>
        </div>

        {state.doseRateEventUgyH !== undefined && (
          <div style={rowStyle}>
            <span style={labelStyle}>Event Dose Rate</span>
            <span
              className="value"
              data-provenance={state.doseRateEventUgyH.prov}
              data-source={state.doseRateEventUgyH.src}
              style={{
                ...valStyle,
                color: "var(--status-warning, #FF453A)",
                fontWeight: 700,
              }}
            >
              {state.doseRateEventUgyH.v} {state.doseRateEventUgyH.unit} {PROVENANCE_GLYPHS[state.doseRateEventUgyH.prov]}
            </span>
          </div>
        )}

        <div style={{ ...rowStyle, borderTop: "1px solid var(--edge, #5C6670)", paddingTop: "4px", marginTop: "2px" }}>
          <span style={labelStyle}>REMS Weather</span>
          <span
            data-provenance="assumed"
            data-source="REMS-Climatology"
            style={{ color: "var(--text-dim, #7B8794)", fontSize: "11px" }}
          >
            {state.remsClimatology?.note ?? "not included in this build"} △
          </span>
        </div>
      </div>

      {/* Earth Link Card */}
      {state.earthLink && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div
            className="module-label"
            style={{
              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              fontSize: "11px",
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
              <span
                className="value"
                data-provenance={state.earthLink.lightTimeSeconds.prov}
                data-source={state.earthLink.lightTimeSeconds.src}
                style={valStyle}
              >
                {formatLightTime(state.earthLink.lightTimeSeconds.v)} {PROVENANCE_GLYPHS[state.earthLink.lightTimeSeconds.prov]}
              </span>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Next Pass</span>
              <span
                className="value"
                data-provenance={state.earthLink.nextPass.prov}
                data-source={state.earthLink.nextPass.src}
                style={valStyle}
              >
                {state.earthLink.nextPass.v} {PROVENANCE_GLYPHS[state.earthLink.nextPass.prov]}
              </span>
            </div>

            <div style={rowStyle}>
              <span style={labelStyle}>Relay Queue</span>
              <span
                className="value"
                data-provenance={state.earthLink.queueUp.prov}
                data-source={state.earthLink.queueUp.src}
                style={valStyle}
              >
                ↑{state.earthLink.queueUp.v} ↓{state.earthLink.queueDown.v} {PROVENANCE_GLYPHS[state.earthLink.queueUp.prov]}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
