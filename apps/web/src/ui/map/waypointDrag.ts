/**
 * Drag of stop markers on the map and of stops-list rows (T08.08; 01 FR-06; 03 §C.3; 04 §E "44 px handles"). Pointer Events only, so
 * the same code serves mouse, pen and touch (T08.09 checks it on a tablet).
 *
 * Map: a press within a marker's radius (14 px) of a stop (never the start) is taken from the map's own pan; moving past 4 px
 * previews the marker at the pointer (`preview`, the waypoint layer's `setPreview`); releasing validates the drop through the
 * placement function (snap offer, "Outside mapped area", refusal) and, if valid, makes one store edit, so a new plan revision
 * supersedes the computation in flight. A press that does not move only selects the stop. `Escape` cancels the drag.
 *
 * List: a press on a row's `[data-drag-handle]` inside `[data-stops-list]` is delegated from the document (the list is
 * `ui/plan/stopsList.ts`, which has no drag logic); releasing over another stop row moves the dragged stop to that row's position
 * with one `reorderWaypoints`, which recomputes at once. Releasing outside the rows clamps to the first or last row.
 */
import type { PlanStore } from "../../state/planStore";
import type { MapHandle } from "../context";
import type { Placement, WaypointPreview } from "./waypointLayer";

export interface WaypointDragOptions {
  preview?: (preview: WaypointPreview | null) => void;
}

/** Marker radius (28 px marker, 04 §C.3) used to decide whether a press is on a stop. */
const HIT_RADIUS_PX = 14;
/** Movement below this is a press, not a drag. */
const DRAG_THRESHOLD_PX = 4;

interface PixelMap {
  getPixelFromCoordinate(coordinate: number[]): number[] | null;
  getCoordinateFromPixel(pixel: number[]): number[] | null;
}

export function initWaypointDrag(mapHandle: MapHandle, planStore: PlanStore, placement: Placement, options: WaypointDragOptions = {}): () => void {
  const map = mapHandle.getMap<PixelMap>();
  const host = mapHandle.getTargetElement();

  type Drag =
    | { kind: "marker"; id: string; startX: number; startY: number; moved: boolean; coord: [number, number] | null }
    | { kind: "row"; id: string; startY: number; moved: boolean };
  let drag: Drag | null = null;

  const pixelOf = (event: MouseEvent): [number, number] => {
    const box = host.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };

  function finish(): void {
    drag = null;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onCancel);
    document.removeEventListener("keydown", onKey);
  }

  function begin(next: Drag): void {
    drag = next;
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey);
  }

  function cancel(): void {
    if (drag?.kind === "marker") options.preview?.(null);
    finish();
  }
  const onCancel = (): void => cancel();
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") cancel();
  };

  function onMove(event: PointerEvent): void {
    if (!drag) return;
    if (drag.kind === "marker") {
      const [px, py] = pixelOf(event);
      if (!drag.moved && Math.hypot(px - drag.startX, py - drag.startY) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      const c = map.getCoordinateFromPixel([px, py]);
      if (!c) return;
      drag.coord = [c[0]!, c[1]!];
      options.preview?.({ id: drag.id, coord: drag.coord });
    } else if (Math.abs(event.clientY - drag.startY) >= DRAG_THRESHOLD_PX) {
      drag.moved = true;
    }
  }

  function onUp(event: PointerEvent): void {
    const current = drag;
    finish();
    if (!current) return;
    if (current.kind === "marker") {
      options.preview?.(null);
      // The drop is where the pointer is released, not where it was last seen moving.
      const [px, py] = pixelOf(event);
      const drop = map.getCoordinateFromPixel([px, py]);
      if (current.moved && drop) void placement.move(current.id, drop[0]!, drop[1]!);
      return;
    }
    if (!current.moved) return;
    const rows = [...document.querySelectorAll<HTMLElement>('[data-stops-list] [data-stops-row][data-role="stop"]')];
    if (rows.length === 0) return;
    const y = event.clientY;
    const first = rows[0]!.getBoundingClientRect();
    const last = rows[rows.length - 1]!.getBoundingClientRect();
    const target = y < first.top ? rows[0]! : y >= last.bottom ? rows[rows.length - 1]! : rows.find((r) => y >= r.getBoundingClientRect().top && y < r.getBoundingClientRect().bottom);
    const targetId = target?.getAttribute("data-waypoint-id");
    if (!targetId || targetId === current.id) return;
    const ids = rows.map((r) => r.getAttribute("data-waypoint-id")!);
    const from = ids.indexOf(current.id);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const order = [...ids];
    order.splice(to, 0, order.splice(from, 1)[0]!);
    planStore.reorderWaypoints(order);
  }

  const onMapDown = (event: Event): void => {
    const e = event as PointerEvent;
    if (drag) return;
    const [px, py] = pixelOf(e);
    for (const w of planStore.get().waypoints) {
      if (w.role !== "stop") continue;
      const at = map.getPixelFromCoordinate([w.x_m, w.y_m]);
      if (!at || Math.hypot(at[0]! - px, at[1]! - py) > HIT_RADIUS_PX) continue;
      // The press is the stop's: the map must not start a pan with it.
      e.stopImmediatePropagation();
      e.preventDefault();
      planStore.selectWaypoint(w.id);
      begin({ kind: "marker", id: w.id, startX: px, startY: py, moved: false, coord: null });
      return;
    }
  };

  const onDocumentDown = (event: Event): void => {
    const e = event as PointerEvent;
    if (drag || !(e.target instanceof Element)) return;
    const handle = e.target.closest("[data-drag-handle]");
    const row = handle?.closest<HTMLElement>('[data-stops-list] [data-stops-row][data-role="stop"]');
    const id = row?.getAttribute("data-waypoint-id");
    if (!handle || !id) return;
    e.preventDefault();
    begin({ kind: "row", id, startY: e.clientY, moved: false });
  };

  // Capture on the map element so the press is seen before the map's own handlers.
  host.addEventListener("pointerdown", onMapDown, true);
  document.addEventListener("pointerdown", onDocumentDown);

  return () => {
    cancel();
    host.removeEventListener("pointerdown", onMapDown, true);
    document.removeEventListener("pointerdown", onDocumentDown);
  };
}
