/** Profile ↔ map hover wiring in projected metres (FR-08, FD-082). Owns listeners and one removable marker layer. */
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Style from "ol/style/Style.js";
import CircleStyle from "ol/style/Circle.js";
import Stroke from "ol/style/Stroke.js";
import { tokenColor } from "../map/tokenColors";
import { LAYER_Z_INDEX, type MapHandle } from "../context";
import type { PlanHoverPosition, PlanStore } from "../../state/planStore";

export function linkProfileToMap(mapHandle: MapHandle, profileElement: HTMLElement, store?: PlanStore): () => void {
  const map = mapHandle.getMap<{
    addLayer(layer: unknown): void; removeLayer(layer: unknown): void;
    on?(type: string, listener: (event: { coordinate: number[]; pixel: number[]; dragging?: boolean }) => void): unknown;
    un?(type: string, listener: (event: { coordinate: number[]; pixel: number[]; dragging?: boolean }) => void): void;
    forEachFeatureAtPixel?(pixel: number[], callback: (feature: Feature) => unknown): unknown;
  }>();
  const source = new VectorSource();
  const layer = new VectorLayer({ source, style: () => new Style({ image: new CircleStyle({ radius: 6, stroke: new Stroke({ color: tokenColor("text-1"), width: 2 }) }) }) });
  layer.setZIndex(LAYER_Z_INDEX.ROUTE + 1);
  map.addLayer(layer);
  type SampleElement = SVGElement | HTMLElement;
  const samples = () => [...profileElement.querySelectorAll<SampleElement>("[data-profile-sample]")];
  const position = (el: SampleElement): PlanHoverPosition | null => {
    const a = el.getAttribute("data-x-m"), b = el.getAttribute("data-y-m");
    if (a === null || b === null) return null;
    return { distance_m: Number(el.dataset.distanceM), leg_index: Number(el.dataset.legIndex), coord: [Number(a), Number(b)] };
  };
  const show = (hover: PlanHoverPosition | null) => {
    source.clear();
    if (hover?.coord) source.addFeature(new Feature(new Point(hover.coord)));
    let nearest: SampleElement | undefined, best = Infinity;
    for (const sample of samples()) {
      sample.removeAttribute("data-active");
      const p = position(sample);
      if (!p || !hover || (hover.leg_index !== undefined && p.leg_index !== hover.leg_index)) continue;
      const delta = hover.distance_m !== undefined ? Math.abs(p.distance_m! - hover.distance_m) : hover.coord ? Math.hypot(p.coord![0] - hover.coord[0], p.coord![1] - hover.coord[1]) : Infinity;
      if (delta < best) { nearest = sample; best = delta; }
    }
    nearest?.setAttribute("data-active", "true");
  };
  let owned: PlanHoverPosition | null = null;
  const clear = () => {
    if (owned && (!store || store.get().hover === owned)) {
      if (store) store.setHover(null); else show(null);
    }
    owned = null;
  };
  const set = (p: PlanHoverPosition | null) => {
    if (!p) { clear(); return; }
    if (store) {
      const previous = store.get().hover;
      store.setHover(p);
      if (store.get().hover !== previous) owned = store.get().hover;
    } else { owned = p; show(p); }
  };
  const over = (event: Event) => {
    const target = event.target as Element | null;
    const sample = target?.closest<SampleElement>("[data-profile-sample]");
    if (sample) set(position(sample));
  };
  const move = (event: { coordinate: number[]; pixel: number[]; dragging?: boolean }) => {
    if (event.dragging) return;
    const leg = map.forEachFeatureAtPixel?.(event.pixel, feature => feature.get("type") === "ok_leg" ? { legIndex: feature.get("legIndex") } : undefined);
    if (!leg || typeof leg !== "object" || !("legIndex" in leg)) { clear(); return; }
    let nearest: PlanHoverPosition | null = null, best = Infinity;
    for (const sample of samples()) {
      const p = position(sample);
      if (!p?.coord || p.leg_index !== leg.legIndex) continue;
      const delta = Math.hypot(p.coord[0] - event.coordinate[0]!, p.coord[1] - event.coordinate[1]!);
      if (delta < best) { nearest = p; best = delta; }
    }
    set(nearest);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const target = (event.target as Element).closest<SampleElement>("[data-profile-sample]");
    const all = samples();
    const index = target ? all.indexOf(target) : -1;
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? all.length - 1 : Math.max(0, Math.min(all.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
    all.forEach((sample, i) => { sample.tabIndex = i === next ? 0 : -1; });
    all[next]?.focus();
  };
  profileElement.addEventListener("keydown", keydown);
  profileElement.addEventListener("pointerover", over);
  profileElement.addEventListener("focusin", over);
  profileElement.addEventListener("pointerleave", clear);
  profileElement.addEventListener("focusout", clear);
  map.on?.("pointermove", move);
  mapHandle.getTargetElement().addEventListener?.("pointerleave", clear);
  const unsubscribe = store?.subscribe(state => show(state.hover));
  show(store?.get().hover ?? null);
  return () => {
    profileElement.removeEventListener("keydown", keydown);
    profileElement.removeEventListener("pointerover", over);
    profileElement.removeEventListener("focusin", over);
    profileElement.removeEventListener("pointerleave", clear);
    profileElement.removeEventListener("focusout", clear);
    map.un?.("pointermove", move);
    mapHandle.getTargetElement().removeEventListener?.("pointerleave", clear);
    unsubscribe?.();
    clear();
    samples().forEach(sample => sample.removeAttribute("data-active"));
    source.clear(); map.removeLayer(layer);
  };
}
