/** Manual-leg entry (T09.08, FR-07/08; FD-125). Science remains in the worker. */
import Draw from "ol/interaction/Draw.js";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import type OlMap from "ol/Map.js";
import type { ManualLegResult, PlanResult, Waypoint } from "@marswalk/protocol";
import type { MapHandle, WorkerClient } from "../context";
import { LAYER_Z_INDEX } from "../context";
import type { PlanStore } from "../../state/planStore";
import { createRouteLayer } from "./routeLayer";
import { tokenColor } from "./tokenColors";

export function needsDrawLegs(search: string, result: Pick<PlanResult, "legs"> | null): boolean {
  return new URLSearchParams(search).get("draw_legs") === "1" || Boolean(result?.legs.length && result.legs.every(l => l.status === "NO_ROUTE"));
}

export interface DrawLegState {
  active: boolean;
  pending: boolean;
  legIndex: number | null;
  points: [number, number][];
  response: ManualLegResult | null;
  error: string | null;
}

/**
 * A per-leg preview, not a complete validated plan; aggregate values remain unavailable.
 *
 * This is what the panel shows while the leg is being validated and before the plan takes it over (N-160(c)). Once the
 * leg is in the plan, the worker's own PLAN_RESULT carries the measured leg and the totals computed from it, and the
 * panel reads them from there — the page never computes them.
 */
export function manualLegPreview(base: PlanResult | null, response: ManualLegResult | null): PlanResult | null {
  return base && response ? { ...base, status: "PARTIAL", legs: [response.leg], warnings: response.warnings, totals: null, stops_timeline: [], radiation: undefined, conditions: undefined } : null;
}

export interface DrawLegsController {
  get(): DrawLegState;
  subscribe(listener: () => void): () => void;
  start(legIndex: number): void;
  finish(): void;
  cancel(): void;
  destroy(): void;
}

export function legPairs(store: PlanStore): [Waypoint, Waypoint][] {
  const { waypoints, scenario } = store.get();
  const pairs: [Waypoint, Waypoint][] = waypoints.slice(1).map((w, i) => [waypoints[i]!, w]);
  if (scenario.loop && waypoints.length > 1) pairs.push([waypoints[waypoints.length - 1]!, waypoints[0]!]);
  return pairs;
}

let requestSequence = 0;

export function initDrawLegs(handle: MapHandle, options: {
  planStore: PlanStore;
  workerClient: Pick<WorkerClient, "postMessage" | "onMessage">;
  timeoutMs?: number;
}): DrawLegsController {
  const { planStore, workerClient } = options;
  const map = handle.getMap<OlMap>();
  const host = handle.getTargetElement();
  let state: DrawLegState = { active: false, pending: false, legIndex: null, points: [], response: null, error: null };
  const listeners = new Set<() => void>();
  let revision = planStore.get().plan_revision;
  let pointerSketch = false;
  let requestId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let drawing: Draw | null = null;
  let crosshair: HTMLElement | null = null;
  const source = new VectorSource();
  const draft = new VectorLayer({ source, zIndex: LAYER_Z_INDEX.ROUTE + 1, style: () => new Style({ stroke: new Stroke({ color: tokenColor("unknown"), width: 3, lineDash: [8, 8] }) }) });
  map.addLayer(draft);
  const emit = () => {
    if (destroyed) return;
    source.clear();
    if (state.active && state.points.length > 1) source.addFeature(new Feature(new LineString(state.points)));
    for (const listener of [...listeners]) listener();
  };
  const previewStore: PlanStore = {
    ...planStore,
    get: () => ({ ...planStore.get(), result: manualLegPreview(planStore.get().result, state.response) }),
    subscribe: listener => {
      const fn = () => listener(previewStore.get()); listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const validated = createRouteLayer(previewStore); map.addLayer(validated);
  function stopInteraction() {
    pointerSketch = false;
    if (drawing) { map.removeInteraction(drawing); drawing.dispose(); drawing = null; }
    crosshair?.remove(); crosshair = null;
  }
  function clearPending() { clearTimeout(timer); timer = undefined; requestId = null; }
  function cancel() {
    clearPending(); stopInteraction();
    state = { active: false, pending: false, legIndex: null, points: [], response: null, error: null }; emit();
  }
  function finish() {
    if (!state.active || destroyed || revision !== planStore.get().plan_revision) return;
    if (pointerSketch) { drawing?.finishDrawing(); return; }
    const pair = legPairs(planStore)[state.legIndex!];
    if (!pair) { cancel(); return; }
    const vertices: [number, number][] = [[pair[0].x_m, pair[0].y_m], ...state.points.slice(1), [pair[1].x_m, pair[1].y_m]];
    stopInteraction();
    const id = `manual-leg-${++requestSequence}`;
    requestId = id;
    state = { ...state, active: false, pending: true, points: vertices, response: null, error: null }; emit();
    timer = setTimeout(() => {
      if (requestId !== id) return;
      clearPending(); state = { ...state, pending: false, error: "Manual-leg validation unavailable. Try again after the worker is ready." }; emit();
    }, options.timeoutMs ?? 10_000);
    try {
      workerClient.postMessage({ type: "VALIDATE_MANUAL_LEG", request_id: id, plan_revision: revision, scenario: planStore.get().scenario, from: pair[0].id, to: pair[1].id, vertices });
    } catch (error) {
      clearPending(); state = { ...state, pending: false, error: `Manual-leg validation unavailable: ${error instanceof Error ? error.message : String(error)}` }; emit();
    }
  }
  const offMessage = workerClient.onMessage(message => {
    if (destroyed || !requestId || message.request_id !== requestId || revision !== planStore.get().plan_revision) return;
    if (message.type === "MANUAL_LEG_RESULT" && message.plan_revision === revision) {
      const pair = legPairs(planStore)[state.legIndex!];
      if (!pair || message.leg.from !== pair[0].id || message.leg.to !== pair[1].id) return;
      clearPending(); state = { ...state, pending: false, response: message, error: null }; emit();
      // The leg joins the plan (N-160(c)): the store sends it with the next COMPUTE_PLAN, and the worker measures it on
      // the grid and computes the totals, the timeline, the conditions and the radiation from it. Only a leg the worker
      // itself answered OK joins: a NO_ROUTE leg is not a route.
      if (message.leg.status === "OK") {
        // The revision the store raises makes the subscriber below cancel the draft, which would drop the answer the
        // panel shows. The leg is already in the plan, so the draft is dropped on purpose and the panel reads the plan.
        planStore.setManualLeg({ from: message.leg.from, to: message.leg.to, vertices: [...state.points] });
      }
    } else if (message.type === "ERROR") {
      clearPending(); state = { ...state, pending: false, error: `Manual-leg validation unavailable: ${message.message}` }; emit();
    }
  });
  const offStore = planStore.subscribe(next => {
    if (next.plan_revision === revision) return;
    revision = next.plan_revision;
    // A revision change discards the draft and any stale reply (FD-441). A validated leg that has joined the plan is
    // not stale: the plan now carries it, so the panel keeps showing the worker's answer (N-160(c)).
    if (state.response) {
      clearPending();
      state = { ...state, active: false, pending: false, legIndex: null, points: [], error: null };
      emit();
      return;
    }
    cancel();
  });
  // The pointer interaction supplies a whole polyline. Both ends are always replaced by the actual waypoints.
  const onKey = (event: KeyboardEvent) => {
    if (!state.active || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest("input,textarea,select,button,a,[contenteditable='true'],[role='button']")) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
    if (event.key === "Enter") {
      event.preventDefault(); event.stopPropagation();
      state = { ...state, points: [...state.points, [...handle.getCenter()]] }; emit();
    }
  };
  host.addEventListener("keydown", onKey, true);
  return {
    get: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start(legIndex) {
      if (destroyed) return;
      cancel();
      const pair = legPairs(planStore)[legIndex];
      if (!pair) return;
      revision = planStore.get().plan_revision;
      state = { ...state, active: true, legIndex, points: [[pair[0].x_m, pair[0].y_m]] };
      drawing = new Draw({ type: "LineString", stopClick: true, style: draft.getStyle()! });
      drawing.on("drawstart", () => { pointerSketch = true; });
      drawing.on("drawend", event => {
        pointerSketch = false;
        const points = (event.feature.getGeometry() as LineString).getCoordinates();
        state = { ...state, points: [[pair[0].x_m, pair[0].y_m], ...points.slice(1, -1).map(p => [p[0]!, p[1]!] as [number, number])] };
        finish();
      });
      map.addInteraction(drawing);
      crosshair = document.createElement("div"); crosshair.className = "marswalk-crosshair"; crosshair.setAttribute("data-slot", "crosshair"); crosshair.setAttribute("aria-hidden", "true"); host.append(crosshair);
      host.focus(); emit();
    },
    finish, cancel,
    destroy() {
      if (destroyed) return;
      cancel(); destroyed = true;
      offMessage(); offStore(); host.removeEventListener("keydown", onKey, true); 
      map.removeLayer(draft); draft.dispose(); source.clear();
      map.removeLayer(validated); validated.destroy(); validated.dispose(); listeners.clear();
    },
  };
}
