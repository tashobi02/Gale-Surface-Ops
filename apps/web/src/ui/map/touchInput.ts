/**
 * Tablet touch input on the map (T08.09; 04 §E Touch; 01 FR-06): a long-press places a stop at the touched point through the
 * placement function (a long-press on a POI pin places the stop at that POI). A press on an existing waypoint belongs to the drag
 * (`waypointDrag.ts`, which also serves touch), so no placement starts there. Lifting early, moving past the tolerance or a second
 * pointer is a tap, a pan or a pinch, and cancels the long-press. Only touch pointers (`pointerType === "touch"`) start one; a mouse
 * uses Add-stop mode. The marker and row-handle sizes (44 px under a coarse pointer, 04 §C.3) are in the CSS and checked by `targets`.
 */
import type { POIFeature } from "@marswalk/protocol";
import type { MapHandle } from "../context";
import { poiPlaceRequest, type Placement } from "./waypointLayer";

/** How long a touch is held to place a stop (engineering limit, not a displayed value). */
export const LONG_PRESS_MS = 500;
/** Movement that turns a press into a pan, pixels. */
const MOVE_TOLERANCE_PX = 10;
/** Waypoints are hit within this many pixels (the 28 px marker's radius). */
const HIT_RADIUS_PX = 14;

export interface TouchInputOptions {
  poiAt?: (coord: [number, number]) => POIFeature | null;
}

interface PixelMap {
  getCoordinateFromPixel(pixel: number[]): number[] | null;
}

export function initTouchInput(mapHandle: MapHandle, placement: Placement, options: TouchInputOptions = {}): () => void {
  const map = mapHandle.getMap<PixelMap>();
  const host = mapHandle.getTargetElement();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let origin: [number, number] | null = null;

  function stop(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    origin = null;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", stop);
    document.removeEventListener("pointercancel", stop);
  }

  function onMove(event: PointerEvent): void {
    if (origin && Math.hypot(event.clientX - origin[0], event.clientY - origin[1]) > MOVE_TOLERANCE_PX) stop();
  }

  const onDown = (event: Event): void => {
    const e = event as PointerEvent;
    if (e.pointerType !== "touch") return;
    if (timer !== null) {
      stop(); // a second pointer: a pinch
      return;
    }
    const box = host.getBoundingClientRect();
    const pixel: [number, number] = [e.clientX - box.left, e.clientY - box.top];
    const c = map.getCoordinateFromPixel(pixel);
    if (!c) return;
    const coord: [number, number] = [c[0]!, c[1]!];
    const metresPerPx = mapHandle.getResolution() ?? 1;
    if (placement.waypointNear(coord, HIT_RADIUS_PX * metresPerPx)) return; // the drag's press
    origin = [e.clientX, e.clientY];
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
    timer = setTimeout(() => {
      timer = null;
      stop();
      const poi = options.poiAt?.(coord) ?? null;
      void placement.place((poi && poiPlaceRequest(poi)) ?? { x_m: coord[0], y_m: coord[1] });
    }, LONG_PRESS_MS);
  };

  host.addEventListener("pointerdown", onDown);
  return () => {
    stop();
    host.removeEventListener("pointerdown", onDown);
  };
}
