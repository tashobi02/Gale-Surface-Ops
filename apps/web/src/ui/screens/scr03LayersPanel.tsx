/**
 * SCR-03 — Layers panel (docs/specs/03 §B; layout in docs/specs/04 §F; mockup `#scr-03-*`).
 * Purpose: Control data layers and understand them.
 * Requirements: FR-02, FR-15, FR-16, FR-17, FR-18, FR-45.
 * Implemented by T07.09 (the panel) with T07.18 (the EZ legend).
 *
 * One row per layer: a switch with its word (ON / OFF, never colour alone), the name, an opacity slider (when the layer has
 * one and is on), the legend, the native resolution, the provenance chip with its source id, and an info link to the layer's
 * anchor in SCR-09 (`#/sources#layer-<id>`). A row is Default, Loading (placeholder and the word), Unavailable (switch disabled,
 * the reason in words, FR-16) or Out of range (hint to zoom in, with the native resolution). Every number is a `Metric`, so it
 * carries `data-provenance` and `data-source` (FR-15); a value the row does not have reads "—".
 *
 * Two scientific overlays at most (04 §D; FD-111): elevation, slope, thermal inertia, spectral, comm shadow and haven bands
 * count; the ortho basemap, hillshade, traverse, POIs, hazards and route do not. Turning a third on turns the one turned on
 * longest ago off, calls `onVisibleChange` for it and says so in a polite status line. The panel owns that rule and the
 * switch state; it holds no OpenLayers object. The rows are described by `PanelLayer`, built by SCR-02 from the layer
 * controllers, so a status change arrives as a new `layers` array and the switch state is kept by layer id.
 */
import { useState, type ReactElement } from "react";
import type { Layer, Provenance } from "@marswalk/protocol";
import { Metric } from "../components/metric";
import { PROVENANCE_GLYPHS, UNAVAILABLE, provAttrs, unavailableOf } from "../components/provenance";
import { StatusIcon } from "../components/statusIcon";
import type { RasterFallbackKind, SlopeLegendClass } from "../map/rasterLayers";
import "./scr03LayersPanel.css";

export type RowStatus = "ready" | "loading" | "unavailable" | "out_of_range";

export type PanelLegend =
  | { type: "none" }
  | {
      type: "classes";
      items: SlopeLegendClass[];
      /** Source ids of the scenario limits the class edges are (`assumed`, 01 FR-05). */
      edgeSources: { caution: string; hard: string };
    }
  | { type: "ramp"; stops: [number, string][] }
  | { type: "ez"; entries: { word: string; shape: "triangle" | "square" | "hexagon"; description: string }[] };

/** A layer drawn from its ImageStatic stand-in because its tiles did not load (T07.16, FD-193). */
export interface PanelFallback {
  kind: RasterFallbackKind;
  /** Metres per image pixel; null reads "—". */
  resolutionM: number | null;
}

export interface PanelLayer {
  id: string;
  title: string;
  /** Counts toward the two-overlay rule (`isScientificOverlay`). */
  scientific: boolean;
  visible: boolean;
  /** 0–1, or null for a row with no opacity slider. */
  opacity: number | null;
  status: RowStatus;
  /** Words for an unavailable row, shown after "Unavailable". */
  unavailableReason?: string;
  /** Set while the layer draws its fallback image; ignored for an unavailable row. */
  fallback?: PanelFallback;
  /** The layer's class, or null when it is not known (a layer with nothing drawn): the chip then reads "—". */
  provenance: Provenance | null;
  sourceIds: readonly string[];
  /** Metres; absent reads "—". */
  nativeResolutionM?: number;
  /** False for a vector row with no resolution to state. Default true. */
  showNative?: boolean;
  units?: string;
  legend: PanelLegend;
}

export interface LayersPanelProps {
  layers: readonly PanelLayer[];
  onVisibleChange: (layerId: string, visible: boolean) => void;
  onOpacityChange: (layerId: string, opacity: number) => void;
}

/** Layer categories that are scientific overlays when the layer is not the hillshade (FD-111). */
const SCIENTIFIC_CATEGORIES: ReadonlySet<Layer["category"]> = new Set(["topographic", "thermal", "spectral"]);
/** Overlays the ops console draws that are not manifest raster layers (FD-111). */
const SCIENTIFIC_IDS: ReadonlySet<string> = new Set(["comm_shadow", "haven_bands"]);

/** Whether a layer counts toward "at most two scientific overlays" (FD-111). */
export function isScientificOverlay(layer: Pick<Layer, "layer_id" | "category">): boolean {
  if (SCIENTIFIC_IDS.has(layer.layer_id)) return true;
  return layer.layer_id !== "hillshade" && SCIENTIFIC_CATEGORIES.has(layer.category);
}

/** At most this many scientific overlays are on at once (04 §D). */
export const MAX_SCIENTIFIC_OVERLAYS = 2;

function sourceOf(layer: PanelLayer): string {
  return layer.sourceIds[0] ?? `layer:${layer.id}`;
}

function Legend({ layer }: { layer: PanelLayer }): ReactElement | null {
  const legend = layer.legend;
  if (legend.type === "none") return null;
  if (legend.type === "classes") {
    return (
      <ul className="scr03-legend" data-slot="layer-legend" aria-label={`${layer.title} classes`}>
        {legend.items.map((item) => (
          <li key={item.key} data-class={item.key}>
            <span className={`scr03-swatch scr03-swatch-${item.key}`} aria-hidden="true" />
            <span>{item.label}</span>
            <span className="scr03-range" data-slot="legend-edge">
              {item.toDeg === null ? <span>from </span> : null}
              <Metric value={item.fromDeg} unit="°" prov="assumed" src={item.key === "caution" ? legend.edgeSources.caution : legend.edgeSources.hard} chip="glyph" />
              {item.toDeg === null ? null : <span> to </span>}
              {item.toDeg === null ? null : <Metric value={item.toDeg} unit="°" prov="assumed" src={legend.edgeSources.hard} chip="glyph" />}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (legend.type === "ramp") {
    return (
      <ul className="scr03-legend" data-slot="layer-legend" aria-label={`${layer.title} scale`}>
        {legend.stops.map(([value, label]) => (
          <li key={`${value}-${label}`} data-slot="legend-edge">
            <Metric value={value} unit={layer.units} prov={layer.provenance} src={sourceOf(layer)} chip="glyph" />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="scr03-legend" data-slot="layer-legend" aria-label="Stop types">
      {legend.entries.map((entry) => (
        <li key={entry.word} data-shape={entry.shape}>
          <span className={`scr03-shape scr03-shape-${entry.shape}`} aria-hidden="true" />
          <span>{entry.word}</span>
          <span className="scr03-note">{entry.description}</span>
        </li>
      ))}
    </ul>
  );
}

/** SCR-03 layers panel (React, ADR-012). */
export function LayersPanel({ layers, onVisibleChange, onOpacityChange }: LayersPanelProps): ReactElement {
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  // Scientific overlays that are on, the one turned on longest ago first. Layers that start on count, in the given order.
  const [order, setOrder] = useState<string[]>(() => layers.filter((l) => l.scientific && l.visible && l.status !== "unavailable").map((l) => l.id));
  const [notice, setNotice] = useState<string | null>(null);

  const isOn = (layer: PanelLayer): boolean => layer.status !== "unavailable" && (visible[layer.id] ?? layer.visible);

  function toggle(layer: PanelLayer): void {
    if (layer.status === "unavailable") return;
    const next = !isOn(layer);
    const changes: Record<string, boolean> = { [layer.id]: next };
    let nextOrder = order;
    let message: string | null = null;
    if (layer.scientific) {
      nextOrder = order.filter((id) => id !== layer.id);
      if (next) {
        nextOrder = [...nextOrder, layer.id];
        if (nextOrder.length > MAX_SCIENTIFIC_OVERLAYS) {
          const droppedId = nextOrder[0];
          nextOrder = nextOrder.slice(1);
          changes[droppedId] = false;
          const dropped = layers.find((l) => l.id === droppedId);
          message = `${dropped?.title ?? droppedId} turned off: at most two scientific overlays at once`;
        }
      }
    }
    setVisible((current) => ({ ...current, ...changes }));
    setOrder(nextOrder);
    setNotice(message);
    for (const [id, value] of Object.entries(changes)) onVisibleChange(id, value);
  }

  return (
    <div className="scr03" data-slot="layers-panel">
      <p className="scr03-rule">Max two scientific overlays at once: a third turns the oldest off.</p>
      {/* The live region is always in the page, so a screen reader announces the text that arrives in it. */}
      <div role="status" data-slot="overlay-live">
        {notice !== null && (
          <p className="scr03-notice" data-slot="overlay-notice">
            {notice}
          </p>
        )}
      </div>
      <ul className="scr03-rows">
        {layers.map((layer) => {
          const on = isOn(layer);
          const unavailable = layer.status === "unavailable";
          const prov = provAttrs(layer.provenance ? { prov: layer.provenance, src: sourceOf(layer) } : unavailableOf(null, `layer.${layer.id}.provenance`));
          const value = opacity[layer.id] ?? layer.opacity ?? 1;
          return (
            <li key={layer.id} className="scr03-row" data-layer-id={layer.id} data-state={layer.status}>
              <div className="scr03-head">
                <button
                  type="button"
                  role="switch"
                  className="scr03-switch"
                  aria-checked={on}
                  aria-label={layer.title}
                  disabled={unavailable}
                  onClick={() => toggle(layer)}
                >
                  {on ? "ON" : "OFF"}
                </button>
                <span className="scr03-name" data-slot="layer-name">
                  {layer.title}
                </span>
                <span className="scr03-chip" data-slot="layer-provenance" {...prov}>
                  {layer.provenance ? `${PROVENANCE_GLYPHS[layer.provenance]} ${layer.provenance.toUpperCase()}` : UNAVAILABLE}
                </span>
                <a className="scr03-info" data-slot="layer-info" href={`#/sources#layer-${layer.id}`} aria-label={`About ${layer.title} in Sources and methods`}>
                  Info
                </a>
              </div>

              {unavailable && (
                <p className="scr03-reason" data-slot="layer-reason">
                  Unavailable{layer.unavailableReason ? `: ${layer.unavailableReason}` : ""}
                </p>
              )}
              {!unavailable && layer.fallback && (
                <p className="scr03-fallback" data-slot="layer-fallback">
                  <StatusIcon status="caution" word="FALLBACK IMAGE" />{" "}
                  Tiles did not load. Showing {layer.fallback.kind === "coarsest_tile" ? "the coarsest tile as one image" : "the static image"} at{" "}
                  <Metric value={layer.fallback.resolutionM} unit="m" prov="derived" src={`layer.${layer.id}.tile_grid`} chip="glyph" /> per pixel.
                </p>
              )}
              {layer.status === "loading" && (
                <div className="scr03-loading" data-slot="layer-loading">
                  <span className="scr03-skeleton" aria-hidden="true" />
                  <span>Loading legend…</span>
                </div>
              )}
              {layer.status === "out_of_range" && (
                <p className="scr03-hint" data-slot="layer-range-hint">
                  Zoom in to see this layer: native <Metric value={layer.nativeResolutionM ?? null} unit="m" prov={layer.provenance} src={sourceOf(layer)} chip="glyph" />
                </p>
              )}
              {!unavailable && layer.status !== "out_of_range" && layer.showNative !== false && (
                <p className="scr03-native" data-slot="layer-native">
                  Native <Metric value={layer.nativeResolutionM ?? null} unit="m" prov={layer.provenance} src={sourceOf(layer)} chip="glyph" />
                </p>
              )}
              {on && !unavailable && layer.opacity !== null && (
                <label className="scr03-opacity">
                  <span className="scr03-note">Opacity</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(value * 100)}
                    {...provAttrs({ prov: "assumed", src: `user:layer.${layer.id}.opacity` })}
                    aria-label={`${layer.title} opacity`}
                    onChange={(event) => {
                      const next = Number(event.currentTarget.value) / 100;
                      setOpacity((current) => ({ ...current, [layer.id]: next }));
                      onOpacityChange(layer.id, next);
                    }}
                  />
                </label>
              )}
              {on && !unavailable && layer.status !== "loading" && <Legend layer={layer} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
