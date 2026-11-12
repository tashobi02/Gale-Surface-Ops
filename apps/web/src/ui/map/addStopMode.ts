/**
 * Add-stop mode (T08.07; 01 FR-06; 03 SCR-02 "Add stop mode (toggle, key A)"; 04 §E; FD-001, FD-117).
 *
 * While on, a crosshair shows at the map centre and a map click places a stop there through the placement function (a click on
 * a POI pin places the stop at that POI with its id and name). `A` toggles the mode and `Enter` places at the crosshair; both keys
 * belong to this module and `keyboard.ts` only delegates to it (FD-117, through `KeyboardPlanContext.addStop`). `Escape` leaves the
 * mode. A placed stop ends the mode; a refusal, an outside click or a pending snap offer keeps it on so the user can try again.
 * Typing in an input never toggles it (keyboard.ts ignores editable targets). The toolbar button reads `isActive` and `onChange`.
 */
import type { MapHandle } from "../context";
import type { POIFeature } from "@marswalk/protocol";
import { poiPlaceRequest, type Placement } from "./waypointLayer";

export interface AddStopMode {
  isActive(): boolean;
  setActive(active: boolean): void;
  toggle(): void;
  /** Place at the map centre (the crosshair). Does nothing when the mode is off. */
  placeAtCrosshair(): Promise<void>;
  /** Called when the mode flips; returns the unsubscribe. */
  onChange(listener: (active: boolean) => void): () => void;
  destroy(): void;
}

export interface AddStopOptions {
  /** The POI pin under a clicked point, if any (the POI layer's `getPoiAt`). */
  poiAt?: (coord: [number, number]) => POIFeature | null;
}

interface ClickSource {
  on(type: "singleclick", listener: (event: { coordinate: number[] }) => void): unknown;
  un(type: "singleclick", listener: (event: { coordinate: number[] }) => void): void;
}

export function initAddStopMode(mapHandle: MapHandle, placement: Placement, options: AddStopOptions = {}): AddStopMode {
  const map = mapHandle.getMap<ClickSource>();
  const host = mapHandle.getTargetElement();
  const listeners = new Set<(active: boolean) => void>();
  let active = false;
  let destroyed = false;
  let crosshair: HTMLElement | null = null;

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && active) setActive(false);
  };

  async function placeAt(coord: [number, number]): Promise<void> {
    const poi = options.poiAt?.(coord) ?? null;
    const request = (poi && poiPlaceRequest(poi)) ?? { x_m: coord[0], y_m: coord[1] };
    if ((await placement.place(request)) === "placed" && active) setActive(false);
  }

  const onClick = (event: { coordinate: number[] }): void => {
    if (active) void placeAt([event.coordinate[0]!, event.coordinate[1]!]);
  };
  map.on("singleclick", onClick);

  function setActive(next: boolean): void {
    if (destroyed || next === active) return;
    active = next;
    if (active) {
      crosshair = document.createElement("div");
      crosshair.className = "marswalk-crosshair";
      crosshair.setAttribute("data-slot", "crosshair");
      crosshair.setAttribute("aria-hidden", "true");
      host.appendChild(crosshair);
      document.addEventListener("keydown", onKey);
    } else {
      crosshair?.remove();
      crosshair = null;
      document.removeEventListener("keydown", onKey);
    }
    for (const listener of [...listeners]) listener(active);
  }

  return {
    isActive: () => active,
    setActive,
    toggle: () => setActive(!active),
    async placeAtCrosshair() {
      if (!active || destroyed) return;
      const centre = mapHandle.getCenter();
      await placeAt([centre[0], centre[1]]);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      if (destroyed) return;
      setActive(false);
      destroyed = true;
      map.un("singleclick", onClick);
      listeners.clear();
    },
  };
}
