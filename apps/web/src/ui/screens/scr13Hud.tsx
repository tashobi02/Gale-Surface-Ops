/**
 * SCR-13 — HUD (docs/specs/03 §B; layout in docs/specs/04 §E.6; mode HUD, 04 §B.2).
 * Purpose: Visor glance view: at most five values, black background, ≥ 7 : 1 contrast, read-only.
 * Requirements: FR-33, NFR-04, NFR-05.
 * Implemented by TASK-24 (T24.08, Ridita Alam).
 */

import type { CSSProperties, ReactElement } from "react";
import type { CrewId, Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import {
  selectHudViewModel,
  type HudViewModel,
} from "../eva/viewModel";
import { StatusIcon } from "../components/statusIcon";

export interface HudProps {
  /** Optional Hab Core client instance. */
  client?: HabClient | null;
  /** Active crew identifier (defaults to "EV1"). */
  crewId?: CrewId;
  /** Direct Snapshot override. */
  snapshot?: Snapshot | null;
  className?: string;
}

const PROV_GLYPHS: Record<string, string> = {
  measured: "■",
  derived: "◆",
  modelled: "○",
  assumed: "△",
  replayed: "▶",
  simulated: "◇",
};

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * SCR-13 HUD Visor Component (04 §E.6).
 * Visor glance view: pure black background, contrast ≥ 7:1, maximum 5 values,
 * corners kept empty for visor distortion, read-only.
 */
export function Hud({
  client,
  crewId = "EV1",
  snapshot,
  className = "",
}: HudProps): ReactElement {
  const activeSnapshot = snapshot ?? client?.state() ?? null;
  const hud: HudViewModel = selectHudViewModel(activeSnapshot, crewId);

  // Black background visor frame styles (04 §C.1, §E.6)
  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    width: "100%",
    minHeight: "100%",
    boxSizing: "border-box",
    background: "var(--hud-bg, #000000)",
    color: "var(--hud-text, #FFFFFF)",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    padding: "32px 48px", // Corners kept empty (visor edge distortion)
    gap: "24px",
    position: "relative",
  };

  const numberLargeStyle: CSSProperties = {
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: "var(--text-value-hud, 64px)",
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums slashed-zero",
  };

  const cardStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    background: "transparent",
    border: "none",
  };

  return (
    <div
      role="region"
      aria-label="EVA Heads Up Display"
      data-screen="SCR-13"
      data-mode="hud"
      className={`hud-visor ${className}`}
      style={rootStyle}
    >
      {/* 1. Alert Banner Slot (only visible when active alert exists, 04 §E.6) */}
      <div
        role="region"
        aria-label="HUD alert slot"
        data-slot="hud-alert-slot"
        style={{
          minHeight: "48px",
          display: "flex",
          alignItems: "center",
        }}
      >
        {hud.alertSlot ? (
          <div
            role="alert"
            data-slot="hud-alert"
            data-level={hud.alertSlot.level}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              color: `var(--hud-${hud.alertSlot.level}, var(--hud-warning, #FF6B6B))`,
              fontSize: "24px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            <StatusIcon status={hud.alertSlot.level} showWord={false} />
            <span>{hud.alertSlot.message}</span>
          </div>
        ) : (
          <div style={{ visibility: "hidden", minHeight: "24px" }} />
        )}
      </div>

      {/* 2, 3, 4: Core telemetry row (HAVEN, TARGET, O2) - 3 glanceable cards */}
      <div
        role="region"
        aria-label="Visor navigation and consumables telemetry"
        data-slot="hud-telemetry"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "32px",
          alignItems: "center",
          width: "100%",
        }}
      >
        {/* Value 1: HAVEN (Time to haven always left) */}
        <div data-slot="hud-haven" style={cardStyle}>
          <span style={{ fontSize: "14px", color: "var(--hud-text-2, #A9B3BE)", letterSpacing: "0.06em" }}>
            HAVEN
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "6px 0" }}>
            <span
              className="value"
              data-provenance={hud.haven.minutes.prov}
              style={{
                ...numberLargeStyle,
                color: `var(--hud-${hud.haven.status}, var(--hud-nominal, #3DDC84))`,
              }}
            >
              {Math.round(hud.haven.minutes.v)}
            </span>
            <span style={{ fontSize: "20px", textTransform: "uppercase" }}>
              {hud.haven.minutes.unit} {PROV_GLYPHS[hud.haven.minutes.prov] ?? "○"}
            </span>
          </div>
          <span style={{ fontSize: "14px", color: "var(--hud-text-2, #A9B3BE)" }}>
            via {hud.haven.targetId ?? "PR1"}
          </span>
        </div>

        {/* Value 2: Target Bearing and Distance */}
        <div data-slot="hud-target" style={cardStyle}>
          <span style={{ fontSize: "14px", color: "var(--hud-text-2, #A9B3BE)", letterSpacing: "0.06em" }}>
            {hud.targetBearingDistance ? hud.targetBearingDistance.targetLabel : "TARGET"}
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "6px 0" }}>
            <span
              className="value"
              data-provenance={hud.targetBearingDistance?.bearingDeg.prov ?? "derived"}
              style={numberLargeStyle}
            >
              ↗ {hud.targetBearingDistance ? String(hud.targetBearingDistance.bearingDeg.v).padStart(3, "0") : "000"}°
            </span>
          </div>
          <span style={{ fontSize: "18px", color: "var(--hud-text, #FFFFFF)" }}>
            {hud.targetBearingDistance ? `${(hud.targetBearingDistance.distanceM.v / 1000).toFixed(2)} KM` : "0.00 KM"}
          </span>
        </div>

        {/* Value 3: O2 Margin */}
        <div data-slot="hud-o2" style={cardStyle}>
          <span style={{ fontSize: "14px", color: "var(--hud-text-2, #A9B3BE)", letterSpacing: "0.06em" }}>
            O₂
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "6px 0" }}>
            <span
              className="value"
              data-provenance={hud.o2.percent.prov}
              style={{
                ...numberLargeStyle,
                color: `var(--hud-${hud.o2.status}, var(--hud-nominal, #3DDC84))`,
              }}
            >
              {hud.o2.percent.v}
            </span>
            <span style={{ fontSize: "20px" }}>
              % {PROV_GLYPHS[hud.o2.percent.prov] ?? "■"}
            </span>
          </div>
          <span style={{ fontSize: "14px", color: "var(--hud-text-2, #A9B3BE)" }}>
            {formatMinutes(hud.o2.timeLeftMinutes.v)} LEFT
          </span>
        </div>
      </div>

      {/* 5: Link Status and Provenance (Bottom right) */}
      <div
        role="region"
        aria-label="Visor link status"
        data-slot="hud-link"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "16px",
          fontSize: "14px",
          color: "var(--hud-text-2, #A9B3BE)",
          letterSpacing: "0.06em",
        }}
      >
        <span>LINK {hud.link.linked ? "▮▮▮" : "▯▯▯"}</span>
        <span>{hud.link.stale ? "STALE" : "◇ SIM"}</span>
      </div>
    </div>
  );
}
