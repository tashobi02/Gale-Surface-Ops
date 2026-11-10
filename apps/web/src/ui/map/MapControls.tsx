/**
 * Shared on-screen map controls (docs/specs/01 FR-32; 04 §E.5; mockup handoff G-42, G-43, DV-14).
 * Buttons, not gestures: each ≥ 56 px on EVA and labelled with a word (04 §A.3 #9). The full-screen
 * EVA map shows +, −, FIT, FOLLOW, LAYERS and CLOSE; ops and planner maps show + / − / FIT (drag
 * and wheel are extras). Implemented by TASK-07 (planner, ops) and TASK-24 (EVA).
 */
import React, { type CSSProperties, type ReactElement } from "react";

/** Which button set to show. */
export type MapControlsVariant = "eva-full" | "ops" | "planner";

export interface MapControlsProps {
  variant: MapControlsVariant;
  /** +1 = zoom in, −1 = zoom out. */
  onZoom: (direction: 1 | -1) => void;
  /** Optional button pan; drag stays an extra. */
  onPan?: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;
  /** FOLLOW keeps the map centred on the crew member (EVA only). */
  follow: boolean;
  onFollow?: (follow: boolean) => void;
  onFit: () => void;
  /** LAYERS panel open (EVA only). */
  layersOpen: boolean;
  onLayers?: (open: boolean) => void;
  /** CLOSE returns to the normal SCR-12 layout (EVA full-screen only). */
  onClose?: () => void;
}

const baseContainerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  position: "absolute",
  zIndex: 10,
  userSelect: "none",
};

const baseBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  boxSizing: "border-box",
  borderRadius: "0px",
  border: "1px solid var(--border-color, #444)",
  backgroundColor: "var(--bg-panel, #111)",
  color: "var(--text-1, #eee)",
  padding: "4px 8px",
};

const evaBtnStyle: CSSProperties = {
  ...baseBtnStyle,
  minWidth: "56px",
  minHeight: "56px",
  padding: "8px 12px",
  fontSize: "16px",
};

/** Labelled map buttons. TASK-07, TASK-24. */
export function MapControls(props: MapControlsProps): ReactElement {
  const isEva = props.variant === "eva-full";
  const btnStyle = isEva ? evaBtnStyle : baseBtnStyle;

  return (
    <nav
      className={`map-controls map-controls--${props.variant}`}
      aria-label="Map controls"
      style={{
        ...baseContainerStyle,
        bottom: isEva ? "16px" : "20px",
        right: "16px",
      }}
    >
      {/* Zoom In */}
      <button
        type="button"
        className="map-control-btn map-control-btn--zoom-in"
        style={btnStyle}
        aria-label="Zoom in"
        onClick={() => props.onZoom(1)}
      >
        <span>+</span>
        {isEva && <span style={{ marginLeft: "4px" }}>IN</span>}
      </button>

      {/* Zoom Out */}
      <button
        type="button"
        className="map-control-btn map-control-btn--zoom-out"
        style={btnStyle}
        aria-label="Zoom out"
        onClick={() => props.onZoom(-1)}
      >
        <span>−</span>
        {isEva && <span style={{ marginLeft: "4px" }}>OUT</span>}
      </button>

      {/* Fit Extent */}
      <button
        type="button"
        className="map-control-btn map-control-btn--fit"
        style={btnStyle}
        aria-label="Fit route to map"
        onClick={() => props.onFit()}
      >
        <span>FIT</span>
      </button>

      {/* Optional Pan Buttons if onPan is provided */}
      {props.onPan && (
        <div
          className="map-controls-pan-group"
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4px" }}
          aria-label="Pan controls"
        >
          <span />
          <button
            type="button"
            className="map-control-btn map-control-btn--pan-up"
            style={{ ...btnStyle, minWidth: isEva ? "56px" : "32px", minHeight: isEva ? "56px" : "32px" }}
            aria-label="Pan up"
            onClick={() => props.onPan!(0, 1)}
          >
            ▲
          </button>
          <span />
          <button
            type="button"
            className="map-control-btn map-control-btn--pan-left"
            style={{ ...btnStyle, minWidth: isEva ? "56px" : "32px", minHeight: isEva ? "56px" : "32px" }}
            aria-label="Pan left"
            onClick={() => props.onPan!(-1, 0)}
          >
            ◀
          </button>
          <span />
          <button
            type="button"
            className="map-control-btn map-control-btn--pan-right"
            style={{ ...btnStyle, minWidth: isEva ? "56px" : "32px", minHeight: isEva ? "56px" : "32px" }}
            aria-label="Pan right"
            onClick={() => props.onPan!(1, 0)}
          >
            ▶
          </button>
          <span />
          <button
            type="button"
            className="map-control-btn map-control-btn--pan-down"
            style={{ ...btnStyle, minWidth: isEva ? "56px" : "32px", minHeight: isEva ? "56px" : "32px" }}
            aria-label="Pan down"
            onClick={() => props.onPan!(0, -1)}
          >
            ▼
          </button>
          <span />
        </div>
      )}

      {/* EVA-only Controls: FOLLOW, LAYERS, CLOSE */}
      {isEva && (
        <>
          <button
            type="button"
            className={`map-control-btn map-control-btn--follow ${props.follow ? "active" : ""}`}
            style={{
              ...btnStyle,
              backgroundColor: props.follow ? "var(--active-bg, #2a4365)" : btnStyle.backgroundColor,
              borderColor: props.follow ? "var(--active-border, #63b3ed)" : btnStyle.borderColor,
            }}
            aria-label="Follow crew member"
            aria-pressed={props.follow}
            onClick={() => props.onFollow?.(!props.follow)}
          >
            <span>FOLLOW</span>
          </button>

          <button
            type="button"
            className={`map-control-btn map-control-btn--layers ${props.layersOpen ? "active" : ""}`}
            style={{
              ...btnStyle,
              backgroundColor: props.layersOpen ? "var(--active-bg, #2a4365)" : btnStyle.backgroundColor,
              borderColor: props.layersOpen ? "var(--active-border, #63b3ed)" : btnStyle.borderColor,
            }}
            aria-label="Toggle layers panel"
            aria-pressed={props.layersOpen}
            onClick={() => props.onLayers?.(!props.layersOpen)}
          >
            <span>LAYERS</span>
          </button>

          <button
            type="button"
            className="map-control-btn map-control-btn--close"
            style={btnStyle}
            aria-label="Close full-screen map"
            onClick={() => props.onClose?.()}
          >
            <span>CLOSE</span>
          </button>
        </>
      )}
    </nav>
  );
}
