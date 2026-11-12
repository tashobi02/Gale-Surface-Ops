/**
 * Frame of a live role view: the screen, plus the SCR-18 overlay when this tab's connection loses the Hab Core heartbeat
 * (docs/specs/03 SCR-18; 04 §E.5; 01 FR-16, FR-32; NFR-13). T24.07, T07.03.
 *
 * The screen under the overlay stays mounted, so its last values are not blanked and its queued commands stay queued.
 * The overlay sets the data-surface of its host (EVA and HUD: `eva`, 16 px codes; ops: `ops`, 12 px codes, 04 §C.2), so a
 * code never renders at the wrong size because an ancestor lacks a surface.
 *
 * A role taken over by a newer device (02 §E.4) covers the screen with `TakenOverNotice` instead; the client has stopped, so
 * no link-lost overlay is shown with it.
 *
 * The link age is client time since the watchdog fired (`since_ms` from the client), shown as a `simulated` value with
 * the source `client:link-watchdog`, as SCR-18 does. It is a display tick only; nothing here feeds the simulation.
 */
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import type { CrewId } from "@marswalk/protocol";
import { useLinkLost, useTakenOver, useReconnectCount } from "../../state/habSession";
import { HabLinkLost } from "../screens/scr18HabLinkLost";
import { TakenOverNotice } from "./TakenOverNotice";
import { StatusIcon } from "../components/statusIcon";
import { PROVENANCE_GLYPHS, UNAVAILABLE, isFiniteNumber, provAttrs, unavailableOf } from "../components/provenance";

const LiveContrast = createContext<{ contrast: boolean; setContrast: (value: boolean) => void } | null>(null);
/** Palette shared by the tablet and all of its overlays, including transport loss. */
export function useLiveContrast() {
  const inherited = useContext(LiveContrast);
  const [contrast, setContrast] = useState(false);
  return inherited ?? { contrast, setContrast };
}

export type LiveVariant = "eva" | "hud" | "ops";

export interface LiveFrameProps {
  variant: LiveVariant;
  /** Required for `eva` and `hud`: there is no default crew member. */
  crewId?: CrewId;
  /** Ops "RETRY": default reloads the page, which reconnects and takes a fresh SNAPSHOT. */
  onRetry?: () => void;
  children?: ReactNode;
}

/** Whole seconds since `sinceMs` (client time), re-read every second while lost; undefined when not lost. */
function useLinkAgeSeconds(sinceMs: number | null): number | undefined {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (sinceMs === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sinceMs]);
  return sinceMs === null ? undefined : Math.max(0, Math.floor((now - sinceMs) / 1000));
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  overflow: "auto",
  background: "var(--surface-0, #0B0D10)",
};

/** Ops: a full-screen notice with retry (03 SCR-18). No crew values: ops is not a crew member. */
function OpsLinkLostNotice({ ageSeconds, reconnectCount, onRetry }: { ageSeconds: number | undefined; reconnectCount: number | null; onRetry: () => void }): ReactElement {
  return (
    <div
      role="region"
      aria-label="Hab Link Lost Notice"
      data-screen="SCR-18"
      data-surface="ops"
      data-status="caution"
      data-slot="link-lost"
      style={{
        minHeight: "100%",
        boxSizing: "border-box",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        color: "var(--fg-1, #ECEFF2)",
        fontFamily: "var(--font-ui, Inter, sans-serif)",
      }}
    >
      <div
        role="alert"
        aria-live="assertive"
        className="alert-bar status-caution"
        data-level="caution"
        style={{
          minHeight: "64px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 16px",
          background: "var(--caution-fill, #FFB020)",
          color: "#000000",
          fontWeight: 700,
          fontSize: "20px",
        }}
      >
        <StatusIcon status="caution" showWord={true} />
        <span>HAB LINK LOST — THIS CONSOLE IS NOT RECEIVING THE HAB CORE</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px", display: "flex", gap: "8px", alignItems: "baseline" }}>
        <span>LINK LOST FOR</span>
        <span
          data-cached-age="true"
          {...provAttrs(
            isFiniteNumber(ageSeconds) ? { prov: "simulated", src: "client:link-watchdog" } : unavailableOf("simulated", "link.age_seconds"),
          )}
          style={{ fontSize: "36px", fontWeight: 700, color: "var(--status-caution, #FFB020)" }}
        >
          {isFiniteNumber(ageSeconds) ? ageSeconds : UNAVAILABLE}
        </span>
        <span>{isFiniteNumber(ageSeconds) ? `s ${PROVENANCE_GLYPHS.simulated}` : ""}</span>
      </div>
      <p>Reconnect attempts: <span data-reconnect-count="true" {...provAttrs(reconnectCount === null ? unavailableOf("derived", "client.reconnect_count") : { prov: "derived", src: "client:reconnect-count" })}>{reconnectCount ?? UNAVAILABLE}</span></p>
      <p style={{ margin: 0, color: "var(--text-2, #A9B3BE)", fontSize: "14px" }}>
        The console reconnects by itself. Values behind this notice are the last ones received and are not current.
      </p>
      <div>
        <button
          type="button"
          data-slot="link-lost-retry"
          onClick={onRetry}
          style={{
            minHeight: "44px",
            padding: "8px 20px",
            background: "var(--raised, #1C2128)",
            color: "var(--text-1, #ECEFF2)",
            border: "1px solid var(--edge, #5C6670)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          RETRY NOW
        </button>
      </div>
    </div>
  );
}

export function LiveFrame({ variant, crewId, onRetry, children }: LiveFrameProps): ReactElement {
  const [contrast, setContrast] = useState(false);
  const reconnectCount = useReconnectCount();
  const link = useLinkLost();
  const takenOver = useTakenOver();
  const age = useLinkAgeSeconds(link.lost ? link.since_ms : null);
  const retry = onRetry ?? (() => globalThis.location?.reload());
  return (
    <LiveContrast.Provider value={{ contrast, setContrast }}>
    <div className="eva-live-surface" data-contrast={contrast ? "high" : "normal"} style={{ display: "contents" }}>
      {/* display: contents keeps the layout; while taken over the screen is inert (no focus, no clicks) and hidden from assistive technology */}
      <div data-slot="live-screen" style={{ display: "contents" }} {...(takenOver ? { inert: true, "aria-hidden": true } : {})}>
        {children}
      </div>
      {takenOver && (
        <div data-slot="taken-over-overlay" data-surface={variant === "ops" ? "ops" : "eva"} style={overlayStyle}>
          <TakenOverNotice roleLabel={variant === "ops" || !crewId ? "OPS" : variant === "hud" ? `HUD ${crewId}` : crewId} />
        </div>
      )}
      {link.lost && !takenOver && (
        <div data-slot="link-lost-overlay" data-mode={variant === "hud" ? "hud" : "ops"} data-surface={variant === "ops" ? "ops" : "eva"} style={overlayStyle}>
          {variant === "ops" || !crewId ? (
            <OpsLinkLostNotice ageSeconds={age} reconnectCount={reconnectCount} onRetry={retry} />
          ) : (
            <HabLinkLost crewId={crewId} ageSeconds={age} mode="eva" />
          )}
        </div>
      )}
    </div>
    </LiveContrast.Provider>
  );
}
