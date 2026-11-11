/**
 * SCR-18 — Hab link lost / connecting (overlay) (docs/specs/03 §B; layout in docs/specs/04 §E.5; mode OPS / HUD, 04 §B.2).
 * Purpose: Real LAN loss (no heartbeat 3 s): banner on live roles, cached plan with ages, auto-reconnect.
 * Requirements: FR-16, FR-32, NFR-13.
 * Implemented by TASK-20, TASK-24 (T24.07, Ridita Alam).
 */

import type { CSSProperties, ReactElement } from "react";
import type { CrewId, Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import { useSnapshot } from "../../state/habSession";
import {
  havenTargetLabel,
  selectEvaViewModel,
  type EvaViewModel,
} from "../eva/viewModel";
import { StatusIcon } from "../components/statusIcon";
import { PROVENANCE_GLYPHS, UNAVAILABLE, fmtInt, glyphOf, isFiniteNumber, provAttrs, unavailableOf } from "../components/provenance";

export interface HabLinkLostProps {
  /** Hab Core client; omitted means the tab's session (state/habSession.ts), null means none. */
  client?: HabClient | null;
  /** The crew member whose cached values are shown. Required: there is no default crew member. */
  crewId: CrewId;
  /** Direct Snapshot override (uses cached snapshot). */
  snapshot?: Snapshot | null;
  /**
   * Link-loss duration in seconds, supplied by the caller from a defensible source (e.g. the client's link
   * watchdog). Omitted means unknown: the age renders "—", never a placeholder.
   */
  ageSeconds?: number;
  /** Role mode: "eva" (tablet overlay) or "ops" (console overlay). */
  mode?: "eva" | "ops";
  className?: string;
}

/**
 * SCR-18 Hab Link Lost Component (04 §E.5, 03 SCR-18).
 * Never blanks a value mid-EVA: displays the last known telemetry marked with
 * an explicit .is-stale class and telemetry age in seconds.
 */
export function HabLinkLost({
  client,
  crewId,
  snapshot,
  ageSeconds,
  mode = "eva",
  className = "",
}: HabLinkLostProps): ReactElement {
  const stored = useSnapshot(client);
  const activeSnapshot = snapshot ?? stored;
  const vm: EvaViewModel = selectEvaViewModel(activeSnapshot, crewId);

  const isOps = mode === "ops";

  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-0, #0B0D10)",
    color: "var(--fg-1, #ECEFF2)",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    padding: "12px",
    gap: "12px",
  };

  const bannerStyle: CSSProperties = {
    minHeight: "64px",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    background: "var(--caution-fill, #FFB020)",
    color: "#000000",
    fontWeight: 700,
    boxSizing: "border-box",
  };

  const cachedBoxStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: isOps ? "repeat(3, 1fr)" : "1fr 1fr 1fr",
    gap: "12px",
    padding: "16px",
    background: "var(--surface-1, #14181D)",
    border: "2px dashed var(--edge, #5C6670)", // Dashed border indicates unlinked / stale
    boxSizing: "border-box",
  };

  const numberStyle: CSSProperties = {
    fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
    fontSize: isOps ? "36px" : "48px",
    fontWeight: 700,
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums slashed-zero",
  };

  return (
    <div
      role="region"
      aria-label="Hab Link Lost Overlay"
      data-screen="SCR-18"
      data-surface={isOps ? "ops" : "eva"}
      data-status="caution"
      data-slot="link-lost"
      className={`scr18-hab-link-lost ${className}`}
      style={rootStyle}
    >
      {/* 1. Caution Alert Banner (64 px) */}
      <div
        role="alert"
        aria-live="assertive"
        className="alert-bar status-caution"
        data-level="caution"
        style={bannerStyle}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <StatusIcon status="caution" showWord={true} />
          <span style={{ fontSize: "18px", letterSpacing: "0.02em" }}>
            HAB LINK LOST — SHOWING CACHED PLAN
          </span>
        </div>
        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px", fontWeight: 600 }}>
          AUTO-RECONNECTING (≤ 1s)
        </span>
      </div>

      {/* 2. Cached Telemetry with Stale Age (04 §A.3 #8, §D.5) */}
      <div
        role="region"
        aria-label="Cached telemetry values"
        data-slot="cached-telemetry"
        className="is-stale"
        style={cachedBoxStyle}
      >
        {/* Cached Haven */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="micro" style={{ color: "var(--text-3, #8592A0)", fontSize: "16px" }}>
            HAVEN (CACHED)
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span
              className="value is-stale"
              {...provAttrs(vm.haven.minutes)}
              style={{ ...numberStyle, color: "var(--fg-3, #8592A0)" }}
            >
              {fmtInt(vm.haven.minutes.v)}
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px", color: "var(--fg-3, #8592A0)" }}>
              {vm.haven.minutes.unit} {glyphOf(vm.haven.minutes)}
            </span>
          </div>
          <span style={{ fontSize: "16px", color: "var(--fg-3, #8592A0)", fontFamily: "var(--font-mono, monospace)" }}>
            {havenTargetLabel(vm.haven)}
          </span>
        </div>

        {/* Cached O2 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="micro" style={{ color: "var(--text-3, #8592A0)", fontSize: "16px" }}>
            O₂ (CACHED)
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span
              className="value is-stale"
              {...provAttrs(vm.o2.percent)}
              style={{ ...numberStyle, color: "var(--fg-3, #8592A0)" }}
            >
              {vm.o2.percent.v}
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px", color: "var(--fg-3, #8592A0)" }}>
              {vm.o2.percent.unit} {glyphOf(vm.o2.percent)}
            </span>
          </div>
          <span style={{ fontSize: "16px", color: "var(--fg-3, #8592A0)", fontFamily: "var(--font-mono, monospace)" }}>
            cached
          </span>
        </div>

        {/* Stale Age Counter */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="micro" style={{ color: "var(--text-3, #8592A0)", fontSize: "16px" }}>
            STALE AGE
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span
              className="value is-stale"
              {...provAttrs(
                isFiniteNumber(ageSeconds)
                  ? { prov: "simulated", src: "client:link-watchdog" }
                  : unavailableOf("simulated", "link.age_seconds"),
              )}
              style={{ ...numberStyle, color: "var(--status-caution, #FFB020)" }}
            >
              {isFiniteNumber(ageSeconds) ? Math.round(ageSeconds) : UNAVAILABLE}
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px", color: "var(--status-caution, #FFB020)" }}>
              {isFiniteNumber(ageSeconds) ? `s ${PROVENANCE_GLYPHS.simulated}` : ""}
            </span>
          </div>
          <span style={{ fontSize: "16px", color: "var(--text-2, #A9B3BE)", fontFamily: "var(--font-mono, monospace)" }}>
            stale tracking
          </span>
        </div>
      </div>

      {/* 3. Action note on queued commands */}
      <div
        style={{
          padding: "8px 12px",
          background: "var(--surface-2, #1C2128)",
          border: "1px solid var(--hairline, #2A313A)",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "16px",
          color: "var(--text-2, #A9B3BE)",
        }}
      >
        <span>STATUS: Offline queue active. Critical commands (SUMMON, ABORT) queue locally and dispatch automatically upon link restoration (NFR-13).</span>
      </div>
    </div>
  );
}
