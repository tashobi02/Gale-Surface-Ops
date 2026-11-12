/**
 * Ops map layers: crew chevrons and trails, vehicles and the hab, comm shadow from the comm grid, haven bands from the
 * compute time field, and the scientific-overlay toggles (docs/specs/01 FR-30, FR-39, FR-42; 04 §C.1 Map overlays,
 * §D.5, §E.4, §E.5). Implemented by T25.02 (Saba Atharique, #187; reworked in the review).
 *
 * Built against the C10 v2 `MapHandle`: the layers are added to the map through `handle.getMap()`; the shared map
 * module (`createMap`, T07.06) and `MapControls` are not used or bundled here. Positions are working-projection metres
 * (IAU_2015:49900): no EPSG:3857, no `ol/sphere` (02 §C.1). Colours are read from the tokens when drawn (./tokenColors).
 *
 * No invented science (04 §A.3 #8, AGENTS rule 2): the comm shadow is drawn only from the comm grid
 * (`comm_hab_asset`, 05 RoutingGrid), the haven bands only from a compute `TimeField` (02 §D.8) at the 10/20/30 minute
 * levels of 04 §C.1; without that data a layer is empty and `availability()` says so. Marching squares over the time
 * field is drawing geometry, not science: the times are compute's.
 *
 * Canvas glyphs (chevron, vehicle squares, reticle, hatch) are `Style` renderers, so nothing needs a canvas until the
 * map draws. Layers carry `provenance` and `source_id` as layer properties because canvas values have no DOM
 * attributes; crew and vehicle state is `simulated` (05 Crew, Vehicle), the comm shadow `derived`, the haven bands
 * `modelled`.
 *
 * TODO(decision): relay-rover coverage on the comm layer (FR-42) needs a viewshed per relay from the engine; not drawn.
 * TODO(decision): the caution hatch for the band beyond the haven rule (04 §C.1), the last-linked time on `Crew` (the
 * STALE age here counts from the first snapshot that shows the crew member unlinked), and the final scientific-layer
 * set (U-57; the toggles use FullScreenMap's four).
 */
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import MultiLineString from "ol/geom/MultiLineString.js";
import MultiPolygon from "ol/geom/MultiPolygon.js";
import Point from "ol/geom/Point.js";
import type BaseLayer from "ol/layer/Base.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style, { type RenderFunction, type StyleFunction } from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import type { FeatureLike } from "ol/Feature.js";
import type { LoadedGrid, TimeField } from "@marswalk/compute";
import type { Crew, Provenance, Snapshot, Vehicle } from "@marswalk/protocol";
import { LAYER_Z_INDEX, type MapHandle } from "../context";
import { fmtDuration } from "../components/provenance";
import { MAX_SCIENCE_LAYERS, type FullScreenMapLayer } from "./FullScreenMap";
import { tokenColor, tokenFont, tokenNumber, withAlpha, type MapToken } from "./tokenColors";

type Coord = [number, number];

/** Scientific overlays the ops toggles switch (04 §E.5); the same set as the full-screen EVA map. */
export type ScientificLayerId = FullScreenMapLayer;
/** Overlays drawn by other modules (raster layers) that the toggles still switch. */
export type ExternalScientificLayerId = Extract<ScientificLayerId, "slope" | "thermal_inertia">;

/** 04 §C.1 haven isochrones: 10/20/30 minute bands. */
export const HAVEN_BAND_MINUTES = [10, 20, 30] as const;
/** 04 §C.1 comm shadow legend. */
export const COMM_SHADOW_LEGEND = "NO SIGNAL — line of sight only";

/**
 * Stack order. Comm shadow and haven bands are scientific overlays, so they sit between `SCIENTIFIC_OVERLAY` and
 * `HAZARDS` (FR-02); crew and vehicles sit above the POIs.
 */
export const OPS_LAYER_Z_INDEX = {
  commShadow: LAYER_Z_INDEX.SCIENTIFIC_OVERLAY + 1,
  havenBands: LAYER_Z_INDEX.SCIENTIFIC_OVERLAY + 2,
  vehicles: LAYER_Z_INDEX.POIS + 10,
  crew: LAYER_Z_INDEX.POIS + 12,
} as const;

/** Display only: the longest crew trail drawn, so a long EVA does not grow the line without bound. */
const MAX_TRAIL_POINTS = 500;
/** 04 §C.1 sizes: crew chevron 28 px; vehicle glyphs a little smaller; haven label and hatch cell. */
const CHEVRON_PX = 28;
const VEHICLE_PX = 22;
const HAB_PX = 26;
const RETICLE_RADIUS_PX = 10;
const HATCH_TILE_PX = 8;

/** Comm grid as 05 RoutingGrid `comm_hab_asset` describes it: 1 = line of sight, 0 = none, 255 = no data. */
export interface CommGridInput {
  cell_m: number;
  width: number;
  height: number;
  /** Top-left corner in projected metres, row 0 = north. */
  origin_m: [number, number];
  values: Uint8Array;
  /** The DataSource or asset id of the grid, e.g. `grid-comm-hab`. */
  source_id: string;
}

/** A compute `TimeField` (seconds from the hab; Infinity = unreachable) and its source id. */
export type HavenFieldInput = Pick<TimeField, "cell_m" | "width" | "height" | "origin_m" | "seconds"> & { source_id: string };

/** The comm grid of a loaded routing grid. */
export function commGridFrom(grid: LoadedGrid, source_id: string): CommGridInput {
  const { cell_m, width, height, origin_m } = grid.meta;
  return { cell_m, width, height, origin_m, values: grid.commHab, source_id };
}

export interface OpsLayers {
  crewLayer: VectorLayer<VectorSource>;
  /** Vehicles and, when `setHab` was called, the hab. */
  vehicleLayer: VectorLayer<VectorSource>;
  commShadowLayer: VectorLayer<VectorSource>;
  havenBandsLayer: VectorLayer<VectorSource>;
  /** Redraw crew, trails and vehicles from a snapshot; null clears them. */
  update(snapshot: Snapshot | null): void;
  /**
   * The crew member this view belongs to. Their marker is drawn as "me" (a ringed chevron with the label "ME") and the
   * others as "buddy" (the plain chevron), so the EVA tablet tells the two apart (plan step 2 of
   * `docs/plan/frontend/17-eva-tablet.md`). Null draws every crew member as "buddy".
   */
  setOwnCrew(crewId: string | null): void;
  /** The hab marker position (the mast of the site manifest), or null for none. */
  setHab(hab: { x_m: number; y_m: number } | null): void;
  /** The comm shadow from the comm grid; null clears it. */
  setCommGrid(grid: CommGridInput | null): void;
  /** The haven bands from a time field; null clears them. */
  setHavenField(field: HavenFieldInput | null): void;
  /** Which data-backed layers have data. A toggle for one without data is disabled with a reason (04 §D.1). */
  availability(): { comm_shadow: boolean; haven_bands: boolean };
  /** Hand over a slope or thermal-inertia layer (raster layers) so the toggles switch it. */
  bindLayer(id: ExternalScientificLayerId, layer: BaseLayer): void;
  /**
   * Turn a scientific overlay on or off. At most two are on: a third turns the oldest off, which is returned so the UI
   * can say so (04 §E.5).
   */
  toggleLayer(id: ScientificLayerId, visible: boolean): { visible: ScientificLayerId[]; turnedOff: ScientificLayerId | null };
  getVisibleLayers(): ScientificLayerId[];
  /** Remove the layers from the map and empty them. */
  destroy(): void;
}

/** What the layers need of the map behind the handle. */
interface LayerHost {
  addLayer(layer: BaseLayer): void;
  removeLayer(layer: BaseLayer): void;
}

// ---------------------------------------------------------------------------
// Geometry from data
// ---------------------------------------------------------------------------

/**
 * Rectangles, in projected metres, covering the cells of the comm grid with no line of sight (value 0). Cells with line
 * of sight (1) and no data (255) are not drawn: unknown is not "no signal". Runs of cells in a row are merged, and
 * identical runs in consecutive rows are merged into one taller rectangle. Each polygon is `[ring]`.
 */
export function commShadowPolygons(grid: CommGridInput): Coord[][][] {
  const { cell_m, width, height, origin_m, values } = grid;
  if (values.length !== width * height) throw new Error(`comm grid has ${values.length} cells, expected ${width * height}`);
  const [ox, oy] = origin_m;
  const out: Coord[][][] = [];
  // Open rectangles by "start-end" column, with the row they started at.
  let open = new Map<string, { c0: number; c1: number; r0: number }>();
  const close = (rect: { c0: number; c1: number; r0: number }, rEnd: number): void => {
    const x0 = ox + rect.c0 * cell_m;
    const x1 = ox + rect.c1 * cell_m;
    const y0 = oy - rect.r0 * cell_m;
    const y1 = oy - rEnd * cell_m;
    out.push([[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]);
  };
  for (let r = 0; r < height; r++) {
    const next = new Map<string, { c0: number; c1: number; r0: number }>();
    let c = 0;
    while (c < width) {
      if (values[r * width + c] !== 0) {
        c++;
        continue;
      }
      const c0 = c;
      while (c < width && values[r * width + c] === 0) c++;
      const key = `${c0}-${c}`;
      const above = open.get(key);
      next.set(key, above ?? { c0, c1: c, r0: r });
      open.delete(key);
    }
    for (const rect of open.values()) close(rect, r);
    open = next;
  }
  for (const rect of open.values()) close(rect, height);
  return out;
}

/**
 * Marching squares over the cell centres of a time field: the segments where `seconds` crosses `level_s`.
 * A cell is inside the band when its time is below the level; unreachable cells (Infinity) are outside. Where one corner
 * is not finite the crossing is put midway. Row 0 is north (02 §D.10).
 */
export function havenContourSegments(field: HavenFieldInput, level_s: number): [Coord, Coord][] {
  const { cell_m, width, height, origin_m, seconds } = field;
  if (seconds.length !== width * height) throw new Error(`time field has ${seconds.length} cells, expected ${width * height}`);
  const [ox, oy] = origin_m;
  const x = (c: number): number => ox + (c + 0.5) * cell_m;
  const y = (r: number): number => oy - (r + 0.5) * cell_m;
  const lerp = (p: number, q: number, a: number, b: number): number => {
    if (!Number.isFinite(p) || !Number.isFinite(q) || p === q) return (a + b) / 2;
    return a + ((level_s - p) / (q - p)) * (b - a);
  };
  const segments: [Coord, Coord][] = [];
  for (let r = 0; r < height - 1; r++) {
    for (let c = 0; c < width - 1; c++) {
      const a = seconds[r * width + c]!; // top left
      const b = seconds[r * width + c + 1]!; // top right
      const cc = seconds[(r + 1) * width + c + 1]!; // bottom right
      const d = seconds[(r + 1) * width + c]!; // bottom left
      const idx = (a < level_s ? 8 : 0) | (b < level_s ? 4 : 0) | (cc < level_s ? 2 : 0) | (d < level_s ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const top = (): Coord => [lerp(a, b, x(c), x(c + 1)), y(r)];
      const right = (): Coord => [x(c + 1), lerp(b, cc, y(r), y(r + 1))];
      const bottom = (): Coord => [lerp(d, cc, x(c), x(c + 1)), y(r + 1)];
      const left = (): Coord => [x(c), lerp(a, d, y(r), y(r + 1))];
      switch (idx) {
        case 1: case 14: segments.push([left(), bottom()]); break;
        case 2: case 13: segments.push([bottom(), right()]); break;
        case 3: case 12: segments.push([left(), right()]); break;
        case 4: case 11: segments.push([top(), right()]); break;
        case 5: segments.push([top(), left()], [bottom(), right()]); break;
        case 6: case 9: segments.push([top(), bottom()]); break;
        case 7: case 8: segments.push([top(), left()]); break;
        case 10: segments.push([top(), right()], [left(), bottom()]); break;
      }
    }
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Canvas glyphs
// ---------------------------------------------------------------------------

function textStyle(text: string, offsetY: number, color: MapToken = "text-1"): Style {
  return new Style({
    text: new Text({
      text,
      font: `600 12px ${tokenFont()}`,
      fill: new Fill({ color: tokenColor(color) }),
      stroke: new Stroke({ color: tokenColor("void"), width: 3 }),
      offsetY,
      textAlign: "center",
    }),
  });
}

/** Crew chevron: 28 px, pointing along the heading (a diamond while the heading is unknown). Unlinked: grey, dashed outline. */
function chevronRenderer(heading: number | null, unlinked: boolean): RenderFunction {
  return (coords, state) => {
    const [px, py] = coords as number[] as [number, number];
    const ctx = state.context;
    const u = (CHEVRON_PX / 2) * state.pixelRatio;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((heading ?? 0) + state.rotation);
    ctx.beginPath();
    if (heading === null) {
      ctx.moveTo(0, -u);
      ctx.lineTo(0.7 * u, 0);
      ctx.lineTo(0, u);
      ctx.lineTo(-0.7 * u, 0);
    } else {
      ctx.moveTo(0, -u);
      ctx.lineTo(0.75 * u, u);
      ctx.lineTo(0, 0.45 * u);
      ctx.lineTo(-0.75 * u, u);
    }
    ctx.closePath();
    ctx.fillStyle = tokenColor(unlinked ? "text-3" : "text-1");
    ctx.strokeStyle = tokenColor(unlinked ? "text-1" : "void");
    ctx.lineWidth = 2 * state.pixelRatio;
    ctx.setLineDash(unlinked ? [4 * state.pixelRatio, 3 * state.pixelRatio] : []);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
}

/** A ring around the chevron of the crew member this view belongs to ("me"); the others are "buddy". */
const ownRingRenderer: RenderFunction = (coords, state) => {
  const [px, py] = coords as number[] as [number, number];
  const ctx = state.context;
  const r = (CHEVRON_PX / 2 + 4) * state.pixelRatio;
  ctx.save();
  ctx.translate(px, py);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * Math.PI);
  ctx.strokeStyle = tokenColor("text-1");
  ctx.lineWidth = 2 * state.pixelRatio;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
};

/** Squared glyph with one chamfered corner (04 §C.1 vehicles, hab). */
function chamferRenderer(sizePx: number, fill: MapToken, stroke: MapToken): RenderFunction {
  return (coords, state) => {
    const [px, py] = coords as number[] as [number, number];
    const ctx = state.context;
    const h = (sizePx / 2) * state.pixelRatio;
    const cut = 0.4 * h;
    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath();
    ctx.moveTo(-h, -h);
    ctx.lineTo(h - cut, -h);
    ctx.lineTo(h, -h + cut);
    ctx.lineTo(h, h);
    ctx.lineTo(-h, h);
    ctx.closePath();
    ctx.fillStyle = tokenColor(fill);
    ctx.strokeStyle = tokenColor(stroke);
    ctx.lineWidth = 2 * state.pixelRatio;
    ctx.setLineDash([]);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
}

/** Target reticle: ring with a cross (04 §C.1 rendezvous point). */
const reticleRenderer: RenderFunction = (coords, state) => {
  const [px, py] = coords as number[] as [number, number];
  const ctx = state.context;
  const r = RETICLE_RADIUS_PX * state.pixelRatio;
  ctx.save();
  ctx.translate(px, py);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * Math.PI);
  ctx.moveTo(-1.6 * r, 0);
  ctx.lineTo(1.6 * r, 0);
  ctx.moveTo(0, -1.6 * r);
  ctx.lineTo(0, 1.6 * r);
  ctx.strokeStyle = tokenColor("text-1");
  ctx.lineWidth = 2 * state.pixelRatio;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
};

/** 45° hatch tile in `color`, or null when no canvas can be made (the fill then falls back to the colour alone). */
function hatchPattern(ctx: CanvasRenderingContext2D, color: string, ratio: number): CanvasPattern | string | null {
  if (typeof document === "undefined") return null;
  const tile = document.createElement("canvas");
  const size = HATCH_TILE_PX * ratio;
  tile.width = size;
  tile.height = size;
  const t = tile.getContext("2d");
  if (!t) return null;
  t.strokeStyle = color;
  t.lineWidth = ratio;
  t.beginPath();
  t.moveTo(0, size);
  t.lineTo(size, 0);
  t.stroke();
  return ctx.createPattern(tile, "repeat");
}

/** Comm shadow: 45° hatch in text-3 at the comm-shadow opacity with a dotted outline (04 §C.1). */
const shadowRenderer: RenderFunction = (coords, state) => {
  const ctx = state.context;
  const ratio = state.pixelRatio;
  const polygons = (Array.isArray((coords as number[][][][])[0]?.[0]?.[0]) ? coords : [coords]) as number[][][][];
  const tint = withAlpha(tokenColor("text-3"), tokenNumber("comm-shadow-opacity"));
  ctx.save();
  ctx.beginPath();
  for (const rings of polygons) {
    for (const ring of rings) {
      ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x!, y!) : ctx.lineTo(x!, y!)));
      ctx.closePath();
    }
  }
  ctx.fillStyle = hatchPattern(ctx, tint, ratio) ?? tint;
  ctx.fill();
  ctx.strokeStyle = tokenColor("text-3");
  ctx.lineWidth = ratio;
  ctx.setLineDash([2 * ratio, 3 * ratio]);
  ctx.stroke();
  ctx.restore();
};

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

function layerOf(source: VectorSource, style: StyleFunction, zIndex: number, provenance: Provenance, source_id: string): VectorLayer<VectorSource> {
  const layer = new VectorLayer({ source, style, zIndex });
  layer.set("provenance", provenance);
  layer.set("source_id", source_id);
  return layer;
}

const crewStyle: StyleFunction = (feature: FeatureLike) => {
  const type = feature.get("type");
  if (type === "crew_marker") {
    const unlinked = feature.get("unlinked") === true;
    const own = feature.get("own") === true;
    const styles: Style[] = [
      new Style({ renderer: chevronRenderer(feature.get("heading_rad") as number | null, unlinked), zIndex: 2 }),
    ];
    // "Me" carries a ring around the chevron, so the two crew members are told apart without colour alone.
    if (own) styles.push(new Style({ renderer: ownRingRenderer, zIndex: 1 }));
    styles.push(textStyle(feature.get("label") as string, -(CHEVRON_PX / 2 + 8), unlinked ? "text-3" : "text-1"));
    return styles;
  }
  if (type === "crew_trail") {
    const unlinked = feature.get("unlinked") === true;
    return new Style({
      stroke: new Stroke({ color: tokenColor(unlinked ? "text-3" : "text-2"), width: 1.5, lineDash: unlinked ? [4, 4] : undefined }),
      zIndex: 1,
    });
  }
  return undefined;
};

const vehicleStyle: StyleFunction = (feature: FeatureLike) => {
  const type = feature.get("type");
  if (type === "vehicle_marker") {
    const pressurized = feature.get("kind") === "pressurized_rover";
    return [
      new Style({ renderer: chamferRenderer(VEHICLE_PX, pressurized ? "text-1" : "void", pressurized ? "void" : "text-1"), zIndex: 2 }),
      textStyle(feature.get("vehicle_id") as string, -(VEHICLE_PX / 2 + 8)),
    ];
  }
  if (type === "hab") return [new Style({ renderer: chamferRenderer(HAB_PX, "text-1", "void"), zIndex: 2 }), textStyle("HAB", -(HAB_PX / 2 + 8))];
  if (type === "vehicle_path") return new Style({ stroke: new Stroke({ color: tokenColor("text-1"), width: 2, lineDash: [6, 6] }), zIndex: 1 });
  if (type === "vehicle_target") return new Style({ renderer: reticleRenderer, zIndex: 2 });
  return undefined;
};

const commShadowStyle: StyleFunction = () => new Style({ renderer: shadowRenderer });

const havenStyle: StyleFunction = (feature: FeatureLike) => {
  const type = feature.get("type");
  if (type === "haven_band") return new Style({ stroke: new Stroke({ color: tokenColor("text-2"), width: 1 }) });
  if (type === "haven_label") return textStyle(feature.get("label") as string, 0, "text-2");
  return undefined;
};

/** Vehicles that are going somewhere show the target as a reticle. */
const MOVING_STATES: ReadonlySet<Vehicle["state"]> = new Set(["DISPATCHED", "EN_ROUTE", "TASKED", "RETURNING"]);

export function createOpsLayers(mapHandle: MapHandle): OpsLayers {
  const crewSource = new VectorSource();
  const vehicleSource = new VectorSource();
  const commSource = new VectorSource();
  const havenSource = new VectorSource();

  const crewLayer = layerOf(crewSource, crewStyle, OPS_LAYER_Z_INDEX.crew, "simulated", "snapshot:crew");
  const vehicleLayer = layerOf(vehicleSource, vehicleStyle, OPS_LAYER_Z_INDEX.vehicles, "simulated", "snapshot:vehicles");
  const commShadowLayer = layerOf(commSource, commShadowStyle, OPS_LAYER_Z_INDEX.commShadow, "derived", "unavailable:comm_hab");
  const havenBandsLayer = layerOf(havenSource, havenStyle, OPS_LAYER_Z_INDEX.havenBands, "modelled", "unavailable:haven_field");
  const layers = [crewLayer, vehicleLayer, commShadowLayer, havenBandsLayer];

  const host = mapHandle.getMap<LayerHost>();
  for (const layer of layers) host.addLayer(layer);

  // Scientific overlays on, oldest first. The two this module draws start on; slope and thermal inertia start off.
  let visible: ScientificLayerId[] = ["comm_shadow", "haven_bands"];
  const external = new Map<ExternalScientificLayerId, BaseLayer>();
  const overlayLayer = (id: ScientificLayerId): BaseLayer | undefined =>
    id === "comm_shadow" ? commShadowLayer : id === "haven_bands" ? havenBandsLayer : external.get(id);
  const applyVisibility = (): void => {
    for (const id of ["slope", "thermal_inertia", "comm_shadow", "haven_bands"] as const) overlayLayer(id)?.setVisible(visible.includes(id));
  };
  applyVisibility();

  let hasComm = false;
  let hasHaven = false;
  let hab: { x_m: number; y_m: number } | null = null;
  let ownCrewId: string | null = null;
  let lastSnapshot: Snapshot | null = null;
  let sessionId: string | null = null;
  const trails = new Map<string, Coord[]>();
  const headings = new Map<string, number | null>();
  const links = new Map<string, { unlinked: boolean; since_ms: number | null }>();

  function drawVehicles(snapshot: Snapshot | null): void {
    vehicleSource.clear();
    if (hab) vehicleSource.addFeature(new Feature({ geometry: new Point([hab.x_m, hab.y_m]), type: "hab" }));
    for (const v of snapshot?.vehicles ?? []) {
      vehicleSource.addFeature(
        new Feature({ geometry: new Point([v.x_m, v.y_m]), type: "vehicle_marker", vehicle_id: v.vehicle_id, kind: v.kind, state: v.state }),
      );
      if (v.path.length >= 2) {
        vehicleSource.addFeature(new Feature({ geometry: new LineString(v.path), type: "vehicle_path", vehicle_id: v.vehicle_id }));
      }
      if (v.task && MOVING_STATES.has(v.state)) {
        vehicleSource.addFeature(
          new Feature({ geometry: new Point([v.task.target.x_m, v.task.target.y_m]), type: "vehicle_target", vehicle_id: v.vehicle_id }),
        );
      }
    }
  }

  function drawCrew(snapshot: Snapshot | null): void {
    crewSource.clear();
    if (!snapshot) {
      trails.clear();
      headings.clear();
      links.clear();
      sessionId = null;
      return;
    }
    if (snapshot.session.session_id !== sessionId) {
      trails.clear();
      headings.clear();
      links.clear();
      sessionId = snapshot.session.session_id;
    }
    const nowMs = Date.parse(snapshot.sim_time);
    snapshot.crew.forEach((c: Crew) => {
      const trail = trails.get(c.crew_id) ?? [];
      const last = trail[trail.length - 1];
      if (!last || last[0] !== c.x_m || last[1] !== c.y_m) {
        if (last) headings.set(c.crew_id, Math.atan2(c.x_m - last[0], c.y_m - last[1]));
        trail.push([c.x_m, c.y_m]);
        if (trail.length > MAX_TRAIL_POINTS) trail.shift();
        trails.set(c.crew_id, trail);
      }

      // Unlinked: the age counts from the first snapshot that showed it unlinked after a linked one; a crew member
      // already unlinked on first sight has an unknown age (shown as "—", never a guess).
      const unlinked = c.stale || !c.linked;
      const prev = links.get(c.crew_id);
      let since_ms: number | null = null;
      if (unlinked) since_ms = prev?.unlinked ? prev.since_ms : prev && Number.isFinite(nowMs) ? nowMs : null;
      links.set(c.crew_id, { unlinked, since_ms });
      const age = since_ms !== null && nowMs >= since_ms ? fmtDuration((nowMs - since_ms) / 1000) : "—";
      const label = unlinked ? `${c.crew_id}\nSTALE ${age}` : c.crew_id;

      crewSource.addFeature(
        new Feature({
          geometry: new Point([c.x_m, c.y_m]),
          type: "crew_marker",
          crew_id: c.crew_id,
          own: ownCrewId !== null && c.crew_id === ownCrewId,
          activity: c.activity,
          heading_rad: headings.get(c.crew_id) ?? null,
          unlinked,
          label,
        }),
      );
      if (trail.length >= 2) {
        crewSource.addFeature(new Feature({ geometry: new LineString(trail), type: "crew_trail", crew_id: c.crew_id, unlinked }));
      }
    });
  }

  return {
    crewLayer,
    vehicleLayer,
    commShadowLayer,
    havenBandsLayer,

    update(snapshot) {
      lastSnapshot = snapshot;
      drawCrew(snapshot);
      drawVehicles(snapshot);
    },

    setOwnCrew(crewId) {
      if (ownCrewId === crewId) return;
      ownCrewId = crewId;
      drawCrew(lastSnapshot);
    },

    setHab(next) {
      hab = next;
      drawVehicles(lastSnapshot);
    },

    setCommGrid(grid) {
      commSource.clear();
      hasComm = false;
      commShadowLayer.set("source_id", grid ? grid.source_id : "unavailable:comm_hab");
      if (!grid) return;
      const polygons = commShadowPolygons(grid);
      if (polygons.length > 0) commSource.addFeature(new Feature({ geometry: new MultiPolygon(polygons), type: "comm_shadow" }));
      hasComm = true;
    },

    setHavenField(field) {
      havenSource.clear();
      hasHaven = false;
      havenBandsLayer.set("source_id", field ? field.source_id : "unavailable:haven_field");
      if (!field) return;
      for (const minutes of HAVEN_BAND_MINUTES) {
        const segments = havenContourSegments(field, minutes * 60);
        if (segments.length === 0) continue;
        havenSource.addFeature(new Feature({ geometry: new MultiLineString(segments), type: "haven_band", minutes }));
        const mid = segments[Math.floor(segments.length / 2)]!;
        havenSource.addFeature(
          new Feature({
            geometry: new Point([(mid[0][0] + mid[1][0]) / 2, (mid[0][1] + mid[1][1]) / 2]),
            type: "haven_label",
            minutes,
            label: `${minutes} min`,
          }),
        );
      }
      hasHaven = true;
    },

    availability: () => ({ comm_shadow: hasComm, haven_bands: hasHaven }),

    bindLayer(id, layer) {
      external.set(id, layer);
      layer.setVisible(visible.includes(id));
    },

    toggleLayer(id, on) {
      let turnedOff: ScientificLayerId | null = null;
      if (on && !visible.includes(id)) {
        if (visible.length >= MAX_SCIENCE_LAYERS) turnedOff = visible[0]!;
        visible = [...visible.filter((v) => v !== turnedOff), id];
      } else if (!on) {
        visible = visible.filter((v) => v !== id);
      }
      applyVisibility();
      return { visible: [...visible], turnedOff };
    },

    getVisibleLayers: () => [...visible],

    destroy() {
      for (const layer of layers) host.removeLayer(layer);
      for (const source of [crewSource, vehicleSource, commSource, havenSource]) source.clear();
      trails.clear();
      headings.clear();
      links.clear();
    },
  };
}
