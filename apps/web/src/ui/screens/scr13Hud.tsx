/**
 * SCR-13 — HUD (docs/specs/03 §B; layout in docs/specs/04 §E.6; mode HUD, 04 §B.2).
 * Purpose: Visor glance view: at most five values, black background, ≥ 7 : 1 contrast, read-only.
 * Requirements: FR-33, NFR-04, NFR-05.
 * Implemented by TASK-24 (T24.08, Ridita Alam).
 */

import type { CSSProperties, ReactElement } from "react";
import type { CrewId, Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { useSnapshot } from "../../state/habSession";
import {
  havenTargetLabel,
  selectHudViewModel,
  type HudViewModel,
} from "../eva/viewModel";
import { StatusIcon } from "../components/statusIcon";
import {
  glyphOf,
  UNAVAILABLE,
  fmtBearing,
  fmtHourMinute,
  fmtInt,
  fmtKilometres,
  provAttrs,
  unavailableOf,
} from "../components/provenance";

export interface HudProps {
  /** Hab Core client; omitted means the tab's session (state/habSession.ts), null means none. */
  client?: HabClient | null;
  /** The crew member whose visor this is. Required: there is no default crew member. */
  crewId: CrewId;
  /** Direct Snapshot override. */
  snapshot?: Snapshot | null;
  className?: string;
}

/** A "—" shown where no target is known: flagged unavailable, class unknown (04 §D.1). */
const NO_TARGET = unavailableOf(null, "next_stop");

/** HUD colour for a status; unknown is neutral, never nominal green. */
function hudStatusColor(status: string): string {
  return status === "unknown" ? "var(--hud-text-2, #A9B3BE)" : `var(--hud-${status}, var(--hud-nominal, #3DDC84))`;
}

/**
 * SCR-13 HUD Visor Component (04 §E.6).
 * Visor glance view: pure black background, contrast ≥ 7:1, maximum 5 values,
 * corners kept empty for visor distortion, read-only.
 */
export function Hud({
  client,
  crewId,
  snapshot,
  className = "",
}: HudProps): ReactElement {
  const stored = useSnapshot(client);
  const activeSnapshot = snapshot ?? stored;
  const hud: HudViewModel = selectHudViewModel(activeSnapshot, crewId);

  // Black background visor frame styles (04 §C.1, §E.6)
  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    width: "100%",
    height: "100dvh",
    overflow: "hidden",
    boxSizing: "border-box",
    background: "var(--hud-bg, #000000)",
    color: "var(--hud-text, #FFFFFF)",
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    padding: "16px 40px", // Corners kept empty (visor edge distortion)
    gap: "12px",
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
              fontSize: "56px",
              minWidth: 0,
              maxWidth: "100%",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "none",
            }}
          >
            <StatusIcon status={hud.alertSlot.level} showWord={true} />
            <span data-hud-value="alert" data-provenance="simulated" data-source="snapshot:alerts.message" title={hud.alertSlot.message} style={{ fontSize: "56px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{hud.alertSlot.message}</span>
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
          gap: "16px",
          alignItems: "start",
          width: "100%",
        }}
      >
        {/* Value 1: HAVEN (Time to haven always left) */}
        <div data-slot="hud-haven" style={cardStyle}>
          <span style={{ fontSize: "16px", color: "var(--hud-text-2, #A9B3BE)", letterSpacing: "0.06em" }}>
            HAVEN <StatusIcon status={hud.haven.status} showWord={true} />
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "6px 0" }}>
            <span
              className="value"
              data-hud-value="haven"
              {...provAttrs(hud.haven.minutes)}
              style={{
                ...numberLargeStyle,
                color: hudStatusColor(hud.haven.status),
              }}
            >
              {fmtInt(hud.haven.minutes.v)}
            </span>
            <span style={{ fontSize: "20px", textTransform: "uppercase" }}>
              {hud.haven.minutes.unit} {glyphOf(hud.haven.minutes)}
            </span>
          </div>
          <span data-provenance="modelled" data-source="snapshot:crew.haven" style={{ fontSize: "16px", color: "var(--hud-text-2, #A9B3BE)" }}>
            {havenTargetLabel(hud.haven)}
          </span>
        </div>

        {/* Value 2: Target Bearing and Distance */}
        <div data-slot="hud-target" style={cardStyle}>
          <span style={{ fontSize: "16px", color: "var(--hud-text-2, #A9B3BE)", letterSpacing: "0.06em" }}>
            <span data-provenance="simulated" data-source="snapshot:crew.next_stop_id">{hud.targetBearingDistance ? hud.targetBearingDistance.targetLabel : "TARGET"}</span>
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "6px 0" }}>
            <span
              className="value"
              data-hud-value="next"
              {...provAttrs(hud.targetBearingDistance?.bearingDeg ?? NO_TARGET)}
              style={numberLargeStyle}
            >
              ↗ {fmtBearing(hud.targetBearingDistance?.bearingDeg.v)}
            </span>
          </div>
          <span
            {...provAttrs(hud.targetBearingDistance?.distanceM ?? NO_TARGET)}
            style={{ fontSize: "18px", color: "var(--hud-text, #FFFFFF)" }}
          >
            {hud.targetBearingDistance ? `${fmtKilometres(hud.targetBearingDistance.distanceM.v)} KM` : UNAVAILABLE}
          </span>
        </div>

        {/* Value 3: O2 Margin */}
        <div data-slot="hud-o2" style={cardStyle}>
          <span style={{ fontSize: "16px", color: "var(--hud-text-2, #A9B3BE)", letterSpacing: "0.06em" }}>
            O₂ <StatusIcon status={hud.o2.status} showWord={true} />
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "6px 0" }}>
            <span
              className="value"
              data-hud-value="o2"
              {...provAttrs(hud.o2.percent)}
              style={{
                ...numberLargeStyle,
                color: hudStatusColor(hud.o2.status),
              }}
            >
              {hud.o2.percent.v}
            </span>
            <span style={{ fontSize: "20px" }}>
              {hud.o2.percent.unit} {glyphOf(hud.o2.percent)}
            </span>
          </div>
          <span {...provAttrs(hud.o2.timeLeftMinutes)} style={{ fontSize: "16px", color: "var(--hud-text-2, #A9B3BE)" }}>
            {fmtHourMinute(hud.o2.timeLeftMinutes.v)} LEFT
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
          fontSize: "16px",
          marginTop: "auto",
          flexWrap: "wrap",
          color: "var(--hud-text-2, #A9B3BE)",
          letterSpacing: "0.06em",
        }}
      >
        <span
          data-hud-value="link"
          style={{ fontSize: "56px", lineHeight: 1 }}
          {...provAttrs(
            hud.link.linked === null ? unavailableOf("simulated", "crew.linked") : { prov: "simulated", src: "snapshot:crew.linked" },
          )}
        >
          LINK {hud.link.linked === null ? UNAVAILABLE : hud.link.linked ? "UP" : "DOWN"}
        </span>
        <StatusIcon status={hud.link.linked === null ? "unknown" : hud.link.linked ? "nominal" : "caution"} showWord={true} />
        <span {...provAttrs(hud.link.hops)}>
          {hud.link.hops.v}
          {hud.link.hops.v !== UNAVAILABLE && ` ${hud.link.hops.unit}`}
        </span>
        <span {...provAttrs(hud.link.via)}>VIA {hud.link.via.v}</span>
        <span data-provenance="simulated" data-source="snapshot:crew.stale">{hud.link.stale === null ? UNAVAILABLE : hud.link.stale ? "STALE" : "◇ SIM"}</span>
      </div>
    </div>
  );
}
