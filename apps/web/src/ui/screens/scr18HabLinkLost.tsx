/**
 * SCR-18 — Hab link lost / connecting (overlay) (docs/specs/03 §B; layout in docs/specs/04 §E.5; mode OPS / HUD, 04 §B.2).
 * Purpose: Real LAN loss (no heartbeat 3 s): banner on live roles, cached plan with ages, auto-reconnect.
 * Requirements: FR-16, FR-32, NFR-13.
 * Implemented by TASK-20, TASK-24 (T24.07, Ridita Alam).
 */

import { useEffect, useState, type CSSProperties, type ReactElement } from "react";
import type { CrewId, Snapshot } from "@marswalk/protocol";
import type { HabClient } from "../../net/habClient";
import {
  selectEvaViewModel,
  type EvaViewModel,
} from "../eva/viewModel";
import { StatusIcon } from "../components/statusIcon";

export interface HabLinkLostProps {
  /** Optional Hab Core client instance. */
  client?: HabClient | null;
  /** Active crew identifier (defaults to "EV1"). */
  crewId?: CrewId;
  /** Direct Snapshot override (uses cached snapshot). */
  snapshot?: Snapshot | null;
  /** Explicit link loss duration override in seconds. */
  ageSeconds?: number;
  /** Role mode: "eva" (tablet overlay) or "ops" (console overlay). */
  mode?: "eva" | "ops";
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
 * SCR-18 Hab Link Lost Component (04 §E.5, 03 SCR-18).
 * Never blanks a value mid-EVA: displays the last known telemetry marked with
 * an explicit .is-stale class and telemetry age in seconds.
 */
export function HabLinkLost({
  client,
  crewId = "EV1",
  snapshot,
  ageSeconds,
  mode = "eva",
  className = "",
}: HabLinkLostProps): ReactElement {
  const activeSnapshot = snapshot ?? client?.state() ?? null;
  const vm: EvaViewModel = selectEvaViewModel(activeSnapshot, crewId);

  // Subscribe to client updates and 1-s interval for live stale age tracking
  const [, setTick] = useState<number>(0);
  useEffect(() => {
    if (!client) return;
    const unsubscribe = client.subscribe(() => setTick((t) => t + 1));
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [client]);

  const linkInfo = client?.linkLost();
  const isLinkLost = linkInfo ? linkInfo.lost : (ageSeconds !== undefined && ageSeconds > 0) || vm.metadata.link.stale;
  const reconnectStatusLabel = isLinkLost ? "AUTO-RECONNECTING (≤ 1s)" : "LINK RESTORED";

  // Derive link age honestly from client store / since_ms (never invented measured)
  const computedAgeSeconds = ageSeconds !== undefined
    ? ageSeconds
    : linkInfo?.since_ms
    ? Math.max(0, Math.floor((Date.now() - linkInfo.since_ms) / 1000))
    : vm.metadata.link.ageSeconds ?? 0;

  const havenTargetLabel = vm.haven.targetId
    ? `via ${vm.haven.targetId}`
    : vm.haven.kind === "hab"
    ? "to Hab Airlock"
    : activeSnapshot?.vehicles?.[0]?.vehicle_id
    ? `via ${activeSnapshot.vehicles[0].vehicle_id}`
    : "—";

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
      data-status="caution"
      data-slot="link-lost"
      className={`scr18-hab-link-lost ${className}`}
      style={rootStyle}
    >
      {/* 1. Caution Alert Banner (64 px) with 4 cues (04 §A.3) */}
      <div
        role="alert"
        aria-live="assertive"
        className="alert-bar status-caution"
        data-level="caution"
        data-provenance="derived"
        data-src="net/linkState"
        style={bannerStyle}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <StatusIcon status="caution" showWord={true} live={true} />
          <span style={{ fontSize: "18px", letterSpacing: "0.02em" }}>
            HAB LINK LOST — SHOWING CACHED PLAN
          </span>
        </div>
        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "14px", fontWeight: 600 }}>
          {reconnectStatusLabel}
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
          <span className="micro" style={{ color: "var(--text-3, #8592A0)" }}>
            HAVEN (CACHED)
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span
              className="value is-stale"
              data-provenance={vm.haven.minutes.prov}
              data-src={vm.haven.minutes.src}
              style={{ ...numberStyle, color: "var(--fg-3, #8592A0)" }}
            >
              {typeof vm.haven.minutes.v === "number" && Number.isFinite(vm.haven.minutes.v)
                ? Math.round(vm.haven.minutes.v)
                : "—"}
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "14px", color: "var(--fg-3, #8592A0)" }}>
              {vm.haven.minutes.unit} {PROV_GLYPHS[vm.haven.minutes.prov] ?? "○"}
            </span>
          </div>
          <span
            data-provenance={vm.haven.minutes.prov}
            data-src={vm.haven.minutes.src}
            style={{ fontSize: "12px", color: "var(--fg-3, #8592A0)", fontFamily: "var(--font-mono, monospace)" }}
          >
            {havenTargetLabel}
          </span>
        </div>

        {/* Cached O2 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="micro" style={{ color: "var(--text-3, #8592A0)" }}>
            O₂ (CACHED)
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span
              className="value is-stale"
              data-provenance={vm.o2.percent.prov}
              data-src={vm.o2.percent.src}
              style={{ ...numberStyle, color: "var(--fg-3, #8592A0)" }}
            >
              {typeof vm.o2.percent.v === "number" && Number.isFinite(vm.o2.percent.v)
                ? vm.o2.percent.v
                : "—"}
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "14px", color: "var(--fg-3, #8592A0)" }}>
              % {PROV_GLYPHS[vm.o2.percent.prov] ?? "■"}
            </span>
          </div>
          <span
            data-provenance={vm.o2.timeLeftMinutes.prov}
            data-src={vm.o2.timeLeftMinutes.src}
            style={{ fontSize: "12px", color: "var(--fg-3, #8592A0)", fontFamily: "var(--font-mono, monospace)" }}
          >
            {typeof vm.o2.timeLeftMinutes.v === "number" && Number.isFinite(vm.o2.timeLeftMinutes.v)
              ? `${formatMinutes(vm.o2.timeLeftMinutes.v)} left`
              : "— left"}{" "}
            {PROV_GLYPHS[vm.o2.timeLeftMinutes.prov] ?? "◆"}
          </span>
        </div>

        {/* Stale Age Counter (honestly derived, client-side, 04 §A.3 #8) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span className="micro" style={{ color: "var(--text-3, #8592A0)" }}>
            STALE AGE
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span
              className="value is-stale"
              data-provenance="derived"
              data-src="net/linkAge"
              style={{ ...numberStyle, color: "var(--status-caution, #FFB020)" }}
            >
              {computedAgeSeconds}
            </span>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "14px", color: "var(--status-caution, #FFB020)" }}>
              s ◆
            </span>
          </div>
          <span style={{ fontSize: "12px", color: "var(--text-2, #A9B3BE)", fontFamily: "var(--font-mono, monospace)" }}>
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
          fontSize: "13px",
          color: "var(--text-2, #A9B3BE)",
        }}
      >
        <span>STATUS: Offline queue active. Critical commands (SUMMON, ABORT) queue locally and dispatch automatically upon link restoration (NFR-13).</span>
      </div>
    </div>
  );
}
