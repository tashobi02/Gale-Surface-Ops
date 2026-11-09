/**
 * Full-screen EVA map for SCR-12 (docs/specs/01 FR-32; 04 §E.5; mockup handoff DV-13, G-42, G-48).
 * Opens over the body area from the mini-map or FULL. Fixed geography holds: the alert slot, the
 * metadata strip and the action row do not move and HAVEN and O₂ stay visible (portrait: in their
 * row; landscape: stacked at the left, map ≥ 80 % of the width, U-60). A warning closes it. At most
 * two scientific layers; a third turns the oldest off and says so. Projected metres only, never
 * EPSG:3857 or `ol/sphere` (02 §C.1). Implemented by TASK-24 (T24.09, Ridita Alam).
 */
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import type { Crew } from "@marswalk/protocol";
import type { ProvenanceValue } from "../eva/viewModel";
import { StatusIcon } from "../components/statusIcon";
import { PROVENANCE_GLYPHS, UNAVAILABLE, fmtFixed, fmtInt, provAttrs } from "../components/provenance";

/** Scientific overlays offered on the full-screen map (04 §E.5; final set U-57). */
export type FullScreenMapLayer = "slope" | "thermal_inertia" | "comm_shadow" | "haven_bands";

/** "At most two scientific overlays at once" (04 §E.5). */
export const MAX_SCIENCE_LAYERS = 2;

export interface FullScreenMapProps {
  crew?: Crew[];
  /** Map view in working-projection metres (IAU_2015:49900). Omitted means unknown: the readout shows "—". */
  view?: { center_x_m: number; center_y_m: number; resolution_m_per_px: number };
  /** HAVEN and O₂ shown in the landscape stack; omitted means "—". Supplied provenance and source are carried through. */
  haven?: ProvenanceValue<number | string>;
  o2?: ProvenanceValue<number | string>;
  /** Oldest first; length ≤ MAX_SCIENCE_LAYERS. */
  layers?: FullScreenMapLayer[];
  orientation?: "portrait" | "landscape";
  hasWarning?: boolean;
  onClose: () => void;
  onLayerToggle?: (layers: FullScreenMapLayer[]) => void;
  onZoom?: (direction: 1 | -1) => void;
  onFit?: () => void;
  onFollow?: (follow: boolean) => void;
  className?: string;
}

/** A missing value: "—" labelled as unavailable (04 §D.1). */
function noValue(path: string): { prov: "assumed"; src: string } {
  return { prov: "assumed", src: `unavailable:${path}` };
}

const LAYER_LABELS: Record<FullScreenMapLayer, string> = {
  slope: "Slope (>15°)",
  thermal_inertia: "Thermal inertia",
  comm_shadow: "Comm shadow",
  haven_bands: "Haven bands",
};

/**
 * SCR-12 Full-Screen EVA Map (04 §E.5).
 * Mounts over the body area with labelled buttons (+, −, FIT, FOLLOW, LAYERS, CLOSE).
 * Positions are drawn strictly in working-projection metres (IAU_2015:49900).
 */
export function FullScreenMap({
  crew = [],
  view,
  haven,
  o2,
  layers = ["slope"],
  orientation = "portrait",
  hasWarning = false,
  onClose,
  onLayerToggle,
  onZoom,
  onFit,
  onFollow,
  className = "",
}: FullScreenMapProps): ReactElement {
  // A warning closes the full-screen map immediately (04 §E.5)
  useEffect(() => {
    if (hasWarning) {
      onClose();
    }
  }, [hasWarning, onClose]);

  const [activeLayers, setActiveLayers] = useState<FullScreenMapLayer[]>(layers.slice(0, MAX_SCIENCE_LAYERS));
  const [layersMenuOpen, setLayersMenuOpen] = useState<boolean>(false);
  const [following, setFollowing] = useState<boolean>(true);
  const [notice, setNotice] = useState<string | null>(null);

  const isLandscape = orientation === "landscape";

  const handleToggleLayer = (layer: FullScreenMapLayer) => {
    let next: FullScreenMapLayer[];
    if (activeLayers.includes(layer)) {
      next = activeLayers.filter((l) => l !== layer);
      setNotice(null);
    } else {
      if (activeLayers.length >= MAX_SCIENCE_LAYERS) {
        // At most two scientific overlays at once; third turns oldest off and says so (04 §E.5)
        const dropped = activeLayers[0];
        next = [...activeLayers.slice(1), layer];
        setNotice(`Layer limit (2) reached: turned off ${LAYER_LABELS[dropped]}`);
      } else {
        next = [...activeLayers, layer];
        setNotice(null);
      }
    }
    setActiveLayers(next);
    onLayerToggle?.(next);
  };

  const handleFollowToggle = () => {
    const nextFollow = !following;
    setFollowing(nextFollow);
    onFollow?.(nextFollow);
  };

  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: isLandscape ? "row" : "column",
    width: "100%",
    height: "100%",
    position: "relative",
    background: "#080A0D",
    color: "var(--fg-1, #ECEFF2)",
    fontFamily: "var(--font-ui, Inter, sans-serif)",
    boxSizing: "border-box",
    overflow: "hidden",
  };

  const mapAreaStyle: CSSProperties = {
    flex: 1,
    width: isLandscape ? "82%" : "100%", // Landscape map takes ≥ 80% width (04 §E.5)
    height: "100%",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "12px",
    boxSizing: "border-box",
  };

  const controlButtonStyle: CSSProperties = {
    minHeight: "56px",
    minWidth: "56px",
    padding: "10px 14px",
    background: "var(--surface-2, #1C2128)",
    border: "2px solid var(--control-edge, #5C6670)",
    color: "var(--fg-1, #ECEFF2)",
    fontFamily: "var(--font-mono, monospace)",
    fontWeight: 700,
    fontSize: "16px",
    textTransform: "uppercase",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  // Landscape HAVEN/O₂ readout: 40 px on phones, 48 px on tablets (04 §E.5 exception under review, U-60)
  const landscapeValueStyle: CSSProperties = {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "var(--text-value-landscape, 48px)",
    fontWeight: 700,
  };

  return (
    <div
      role="region"
      aria-label="Full-screen surface operations map"
      data-screen="SCR-12-FULLMAP"
      data-orientation={orientation}
      data-crs="IAU_2015:49900"
      className={`fullscreen-map ${className}`}
      style={rootStyle}
    >
      {/* Landscape left stacked telemetry placeholder (04 §E.5: HAVEN and O2 stack at left) */}
      {isLandscape && (
        <div
          data-slot="landscape-telemetry-stack"
          style={{
            width: "18%",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            padding: "8px",
            borderRight: "1px solid var(--hairline, #2A313A)",
          }}
        >
          <div data-slot="haven-compact" style={{ padding: "8px", background: "var(--surface-1, #14181D)" }}>
            <span className="micro" style={{ fontSize: "16px" }}>HAVEN</span>
            <div
              {...provAttrs(haven ?? noValue("crew.haven.minutes"))}
              style={landscapeValueStyle}
            >
              {haven ? fmtInt(haven.v) : UNAVAILABLE}
              {haven && typeof haven.v === "number" ? " MIN" : ""} {PROVENANCE_GLYPHS[(haven ?? noValue("")).prov]}
            </div>
          </div>
          <div data-slot="o2-compact" style={{ padding: "8px", background: "var(--surface-1, #14181D)" }}>
            <span className="micro" style={{ fontSize: "16px" }}>O₂</span>
            <div {...provAttrs(o2 ?? noValue("crew.o2_frac"))} style={landscapeValueStyle}>
              {o2 ? o2.v : UNAVAILABLE}
              {o2 && typeof o2.v === "number" ? " %" : ""} {PROVENANCE_GLYPHS[(o2 ?? noValue("")).prov]}
            </div>
          </div>
        </div>
      )}

      {/* Main Map Viewport Canvas */}
      <div style={mapAreaStyle}>
        {/* Top bar with CRS indicator and Layer Notice */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "16px",
                letterSpacing: "0.06em",
                color: "var(--text-3, #8592A0)",
                textTransform: "uppercase",
              }}
            >
              Gale Crater · Working Projection: IAU_2015:49900 (+proj=eqc) · Metres
            </span>
            {/* View state, not a measurement: derived from the map's own extent (no sample centre when unknown) */}
            <span
              className="value"
              data-provenance={view ? "derived" : "assumed"}
              data-source={view ? "map:view" : "unavailable:map.view"}
              title={view ? "map:view" : "unavailable:map.view"}
              style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "16px", color: "var(--text-2, #A9B3BE)" }}
            >
              X: {fmtFixed(view?.center_x_m, 1)} m · Y: {fmtFixed(view?.center_y_m, 1)} m ·{" "}
              {view ? view.resolution_m_per_px : UNAVAILABLE} m/px
            </span>
          </div>

          {notice && (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: "6px 10px",
                background: "var(--surface-2, #1C2128)",
                border: "1px solid var(--status-caution, #FFB020)",
                color: "var(--status-caution, #FFB020)",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "16px",
              }}
            >
              <StatusIcon status="caution" showWord={true} /> {notice}
            </div>
          )}
        </div>

        {/* Center Canvas / Map Graphic Representation */}
        <div
          data-slot="map-canvas"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          {/* Active Layers Badges */}
          <div
            style={{
              position: "absolute",
              top: "8px",
              left: "8px",
              display: "flex",
              gap: "6px",
            }}
          >
            {activeLayers.map((l) => (
              <span
                key={l}
                style={{
                  padding: "4px 8px",
                  background: "var(--surface-2, #1C2128)",
                  border: "1px solid var(--edge, #5C6670)",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "16px",
                  textTransform: "uppercase",
                }}
              >
                LAYER: {LAYER_LABELS[l]}
              </span>
            ))}
          </div>

          {/* Layers Popover Menu */}
          {layersMenuOpen && (
            <div
              role="dialog"
              aria-label="Scientific layers selection"
              style={{
                position: "absolute",
                bottom: "72px",
                right: "8px",
                background: "var(--surface-1, #14181D)",
                border: "2px solid var(--control-edge, #5C6670)",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                zIndex: 10,
              }}
            >
              <span className="micro" style={{ color: "var(--text-2, #A9B3BE)" }}>
                SELECT LAYERS (MAX 2)
              </span>
              {(Object.keys(LAYER_LABELS) as FullScreenMapLayer[]).map((layerKey) => {
                const isActive = activeLayers.includes(layerKey);
                return (
                  <button
                    key={layerKey}
                    type="button"
                    onClick={() => handleToggleLayer(layerKey)}
                    style={{
                      ...controlButtonStyle,
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: isActive ? "var(--surface-2, #1C2128)" : "transparent",
                      // Selection is neutral chrome with a word (ON/OFF); status colours mean status only
                      border: isActive
                        ? "3px solid var(--text-1, #ECEFF2)"
                        : "1px solid var(--hairline, #2A313A)",
                    }}
                  >
                    <span>{LAYER_LABELS[layerKey]}</span>
                    <span>{isActive ? "ON" : "OFF"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Control Bar: +, −, FIT, FOLLOW, LAYERS, CLOSE (all ≥ 56 px) */}
        <div
          role="toolbar"
          aria-label="Map navigation controls"
          data-slot="map-controls"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              id="map-ctrl-zoom-in"
              type="button"
              className="btn"
              style={controlButtonStyle}
              aria-label="Zoom in"
              onClick={() => onZoom?.(1)}
            >
              +
            </button>
            <button
              id="map-ctrl-zoom-out"
              type="button"
              className="btn"
              style={controlButtonStyle}
              aria-label="Zoom out"
              onClick={() => onZoom?.(-1)}
            >
              −
            </button>
            <button
              id="map-ctrl-fit"
              type="button"
              className="btn"
              style={controlButtonStyle}
              aria-label="Fit route into view"
              onClick={onFit}
            >
              FIT
            </button>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              id="map-ctrl-follow"
              type="button"
              className="btn"
              style={{
                ...controlButtonStyle,
                background: following ? "var(--surface-2, #1C2128)" : "transparent",
                border: following
                  ? "3px solid var(--text-1, #ECEFF2)"
                  : "2px solid var(--control-edge, #5C6670)",
              }}
              aria-pressed={following}
              aria-label="Follow crew member position"
              onClick={handleFollowToggle}
            >
              FOLLOW {following ? "ON" : "OFF"}
            </button>
            <button
              id="map-ctrl-layers"
              type="button"
              className="btn"
              style={controlButtonStyle}
              aria-expanded={layersMenuOpen}
              aria-label="Toggle scientific layers menu"
              onClick={() => setLayersMenuOpen(!layersMenuOpen)}
            >
              LAYERS
            </button>
            <button
              id="map-ctrl-close"
              type="button"
              className="btn"
              style={{
                ...controlButtonStyle,
                background: "var(--raised, #1C2128)",
              }}
              aria-label="Close full-screen map"
              onClick={onClose}
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
