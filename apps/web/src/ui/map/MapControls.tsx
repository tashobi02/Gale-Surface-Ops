/**
 * Shared on-screen map controls (docs/specs/01 FR-32; 04 §E.5; mockup handoff G-42, G-43, DV-14).
 * Buttons, not gestures: every action has a button, so the map works without drag, wheel or pinch (04 §A.3 #9: no
 * hidden controls; each control carries a word or a conventional symbol with an accessible name). The full-screen
 * EVA map shows +, −, FIT, FOLLOW, LAYERS and CLOSE; ops and planner maps show + / − / FIT (drag and wheel are
 * extras). With `onPan`, four pan buttons labelled NORTH, SOUTH, EAST and WEST are added.
 * Implemented by TASK-07 (planner, ops) and TASK-24 (EVA).
 *
 * - Chrome is neutral (`--raised`, `--edge`, `--text-1`): status colours mean status only (04 §A.3 #1). A pressed
 *   control is marked with a thicker `--text-1` edge and a word (FOLLOW ON / OFF), never a colour alone.
 * - Target size follows the surface (04 §E): 32 px planner (mouse), 44 px ops (tablet), 56 px EVA (gloves), with
 *   ≥ 8 px gaps on EVA.
 * - Placement is the caller's: the toolbar is not positioned absolutely.
 * - `mapControlHandlers` turns a `MapHandle` into the `onZoom`, `onPan` and `onFit` callbacks, so screens call the
 *   map handle and never OpenLayers.
 */
import type { CSSProperties, ReactElement } from "react";
import type { MapHandle } from "../context";

/** Which button set to show. */
export type MapControlsVariant = "eva-full" | "ops" | "planner";

export interface MapControlsProps {
  variant: MapControlsVariant;
  /** +1 = zoom in, −1 = zoom out. */
  onZoom: (direction: 1 | -1) => void;
  /**
   * Optional button pan (adds NORTH, SOUTH, EAST, WEST); drag stays an extra. Screen directions, y down, as
   * `MapHandle.panBy`: north = (0, −1), south = (0, 1), west = (−1, 0), east = (1, 0).
   */
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
  /** Class for the caller's placement (the toolbar is not positioned here). */
  className?: string;
}

/** Minimum target per surface, px (04 §E: mouse 32, tablet 44, EVA 56). */
export const MAP_CONTROL_TARGET_PX: Record<MapControlsVariant, number> = {
  planner: 32,
  ops: 44,
  "eva-full": 56,
};

/** Pixels one pan-button press moves the view (the keyboard step of keyboard.ts). */
export const MAP_CONTROL_PAN_STEP_PX = 50;

interface MapControlHandlers {
  onZoom: (direction: 1 | -1) => void;
  onPan: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;
  onFit: () => void;
}

/**
 * `MapControls` callbacks backed by a `MapHandle`. FIT fits `fitExtent` (the AOI or the route's extent, in projected
 * metres); a pan button moves the view `panStepPx` screen pixels.
 */
export function mapControlHandlers(
  handle: MapHandle,
  options: { fitExtent: () => [number, number, number, number]; panStepPx?: number },
): MapControlHandlers {
  const step = options.panStepPx ?? MAP_CONTROL_PAN_STEP_PX;
  return {
    onZoom: (direction) => handle.zoomBy(direction),
    onPan: (dx, dy) => handle.panBy(dx * step, dy * step),
    onFit: () => handle.fitExtent(options.fitExtent()),
  };
}

const PAN_BUTTONS = [
  { control: "pan-north", glyph: "↑", word: "NORTH", label: "Pan north", dx: 0, dy: -1 },
  { control: "pan-south", glyph: "↓", word: "SOUTH", label: "Pan south", dx: 0, dy: 1 },
  { control: "pan-west", glyph: "←", word: "WEST", label: "Pan west", dx: -1, dy: 0 },
  { control: "pan-east", glyph: "→", word: "EAST", label: "Pan east", dx: 1, dy: 0 },
] as const;

/** Labelled map buttons. TASK-07, TASK-24. */
export function MapControls(props: MapControlsProps): ReactElement {
  const eva = props.variant === "eva-full";
  const target = `${MAP_CONTROL_TARGET_PX[props.variant]}px`;

  const button = (pressed: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    minWidth: target,
    minHeight: target,
    padding: eva ? "10px 14px" : "4px 10px",
    boxSizing: "border-box",
    background: "var(--raised)",
    // Selection is neutral chrome with a word; status colours mean status only
    border: pressed ? "3px solid var(--text-1)" : "2px solid var(--edge)",
    color: "var(--text-1)",
    fontFamily: "var(--font-mono)",
    fontWeight: 700,
    fontSize: eva ? "16px" : "var(--text-ui)",
    textTransform: "uppercase",
    cursor: "pointer",
  });
  const group: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "8px" };

  return (
    <div
      role="toolbar"
      aria-label="Map navigation controls"
      data-slot="map-controls"
      data-fullmap-controls={eva ? "true" : undefined}
      data-variant={props.variant}
      className={props.className}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px", width: "100%", boxSizing: "border-box" }}
    >
      <div role="group" aria-label="Zoom and fit" style={group}>
        <button type="button" data-control="zoom-in" id={eva ? "map-ctrl-zoom-in" : undefined} className="btn" style={button(false)} aria-label="Zoom in" onClick={() => props.onZoom(1)}>
          +
        </button>
        <button type="button" data-control="zoom-out" id={eva ? "map-ctrl-zoom-out" : undefined} className="btn" style={button(false)} aria-label="Zoom out" onClick={() => props.onZoom(-1)}>
          −
        </button>
        <button type="button" data-control="fit" id={eva ? "map-ctrl-fit" : undefined} className="btn" style={button(false)} aria-label="Fit route into view" onClick={() => props.onFit()}>
          FIT
        </button>
      </div>

      {props.onPan && (
        <div role="group" aria-label="Pan" style={group}>
          {PAN_BUTTONS.map((pan) => (
            <button
              key={pan.control}
              type="button"
              data-control={pan.control}
              className="btn"
              style={button(false)}
              aria-label={pan.label}
              onClick={() => props.onPan!(pan.dx, pan.dy)}
            >
              <span aria-hidden="true">{pan.glyph}</span>
              {pan.word}
            </button>
          ))}
        </div>
      )}

      {eva && (
        <div role="group" aria-label="View" style={group}>
          <button
            type="button"
            data-control="follow"
            id="map-ctrl-follow"
            className="btn"
            style={button(props.follow)}
            aria-pressed={props.follow}
            aria-label="Follow crew member position"
            onClick={() => props.onFollow?.(!props.follow)}
          >
            FOLLOW {props.follow ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            data-control="layers"
            id="map-ctrl-layers"
            className="btn"
            style={button(props.layersOpen)}
            aria-expanded={props.layersOpen}
            aria-label="Toggle scientific layers menu"
            onClick={() => props.onLayers?.(!props.layersOpen)}
          >
            LAYERS
          </button>
          <button type="button" data-control="close" id="map-ctrl-close" className="btn" style={button(false)} aria-label="Close full-screen map" onClick={() => props.onClose?.()}>
            CLOSE
          </button>
        </div>
      )}
    </div>
  );
}
