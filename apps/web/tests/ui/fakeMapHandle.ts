/**
 * Test double for the C10 v2 `MapHandle` (apps/web/src/ui/context.ts). The shared map module (`createMap`, T07.06) is not
 * needed: layer modules only use `getMap()` to add layers and `fitExtent()` to zoom, so this records those calls.
 * `getMap()` returns a minimal layer host with the `addLayer` / `removeLayer` the layer modules call.
 */
import type { MapHandle, MapView } from "../../src/ui/context";

export interface FakeLayerHost {
  layers: unknown[];
  addLayer(layer: unknown): void;
  removeLayer(layer: unknown): void;
}

export interface FakeMapHandle {
  handle: MapHandle;
  host: FakeLayerHost;
  /** Extents passed to `fitExtent`, in call order. */
  fitted: [number, number, number, number][];
  /** Centres passed to `setCenter`, in call order. */
  centred: [number, number][];
}

export function fakeMapHandle(target?: HTMLElement): FakeMapHandle {
  const fitted: [number, number, number, number][] = [];
  const centred: [number, number][] = [];
  const host: FakeLayerHost = {
    layers: [],
    addLayer(layer) {
      host.layers.push(layer);
    },
    removeLayer(layer) {
      host.layers = host.layers.filter((l) => l !== layer);
    },
  };
  const view: MapView = { center_x_m: 0, center_y_m: 0, resolution_m_per_px: 1 };
  const handle: MapHandle = {
    getMap: <T>() => host as unknown as T,
    getTargetElement: () => target ?? ({ tabIndex: 0 } as HTMLElement),
    fitExtent: (extent) => {
      fitted.push(extent);
    },
    setCenter: (coord) => {
      centred.push(coord);
    },
    getCenter: () => [view.center_x_m, view.center_y_m],
    setZoom: () => {},
    getZoom: () => 3,
    getResolution: () => view.resolution_m_per_px,
    panBy: () => {},
    zoomBy: () => {},
    onViewChange: () => () => {},
    destroy: () => {},
  };
  return { handle, host, fitted, centred };
}
