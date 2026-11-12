/**
 * T07.01 — C10 v2 (UI app context, map handle v2, React stubs) contract tests.
 * C10 follows main's conventions: `data-provenance` + `data-source`, React components and props,
 * `PROVENANCE_VALUES` from the protocol `Provenance`, MapHandle usable by keyboard.ts and FullScreenMap.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Provenance } from "@marswalk/protocol";
import {
  LAYER_Z_INDEX,
  PROVENANCE_ATTR,
  PROVENANCE_VALUES,
  SOURCE_ATTR,
  URL_PARAMS,
  type MapHandle,
  type MapView,
  type WorkerClient,
} from "../../src/ui/context";
import { provAttrs, glyphOf, PROVENANCE_GLYPHS } from "../../src/ui/components/provenance";
import { attachKeyboardControls, type KeyboardMapHandle } from "../../src/ui/map/keyboard";
import type { FullScreenMapProps } from "../../src/ui/map/FullScreenMap";
import { validateSite } from "../../src/boot/validateSite";
import { ProfileChart } from "../../src/ui/results/profileChart";
import { linkProfileToMap } from "../../src/ui/results/profileLink";
import { createMapSnapshot } from "../../src/ui/briefing/mapSnapshot";
import { exportPlan } from "../../src/export/planExport";
import { installDom, removeDom } from "./domHarness";

const SIX_CLASSES: Provenance[] = ["measured", "derived", "modelled", "assumed", "replayed", "simulated"];

/** A MapHandle with the v2 surface, recording what the keyboard layer asks of it. */
function fakeMapHandle(target: HTMLElement) {
  const view: MapView = { center_x_m: 10, center_y_m: -20, resolution_m_per_px: 2 };
  const listeners = new Set<(v: MapView) => void>();
  const calls: string[] = [];
  const handle: MapHandle = {
    getMap: <T>() => ({}) as T,
    getTargetElement: () => target,
    fitExtent: () => {},
    setCenter: () => {},
    getCenter: () => [view.center_x_m, view.center_y_m],
    setZoom: () => {},
    getZoom: () => 3,
    getResolution: () => view.resolution_m_per_px,
    panBy: (dx, dy) => calls.push(`pan ${dx} ${dy}`),
    zoomBy: (delta) => calls.push(`zoom ${delta}`),
    onViewChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => {},
  };
  return { handle, view, listeners, calls };
}

describe("C10 v2 constants (T07.01; FR-02, FR-15, NFR-05)", () => {
  it("orders the layers basemap < hillshade < scientific overlay < hazards < route < POIs (FR-02)", () => {
    expect(LAYER_Z_INDEX.BASEMAP).toBeLessThan(LAYER_Z_INDEX.HILLSHADE);
    expect(LAYER_Z_INDEX.HILLSHADE).toBeLessThan(LAYER_Z_INDEX.SCIENTIFIC_OVERLAY);
    expect(LAYER_Z_INDEX.SCIENTIFIC_OVERLAY).toBeLessThan(LAYER_Z_INDEX.HAZARDS);
    expect(LAYER_Z_INDEX.HAZARDS).toBeLessThan(LAYER_Z_INDEX.ROUTE);
    expect(LAYER_Z_INDEX.ROUTE).toBeLessThan(LAYER_Z_INDEX.POIS);
  });

  it("names the provenance and source attributes as main's provAttrs writes them", () => {
    expect(PROVENANCE_ATTR).toBe("data-provenance");
    expect(SOURCE_ATTR).toBe("data-source");
    const attrs = provAttrs({ prov: "derived", src: "grid:slope_p90" });
    expect(attrs[PROVENANCE_ATTR]).toBe("derived");
    expect(attrs[SOURCE_ATTR]).toBe("grid:slope_p90");
  });

  it("derives PROVENANCE_VALUES from the protocol Provenance: exactly the six classes, each with a glyph", () => {
    expect([...PROVENANCE_VALUES].sort()).toEqual([...SIX_CLASSES].sort());
    for (const value of PROVENANCE_VALUES) {
      expect(PROVENANCE_GLYPHS[value]).toBeTruthy();
      expect(glyphOf({ prov: value })).toBe(PROVENANCE_GLYPHS[value]);
    }
  });

  it("exports the URL parameters", () => {
    expect(URL_PARAMS.SITE).toBe("site");
    expect(URL_PARAMS.DEBUG).toBe("debug");
    expect(URL_PARAMS.MOCK_WORKER).toBe("mock_worker");
  });
});

describe("MapHandle v2 serves keyboard.ts and FullScreenMap (decision 11 Nov)", () => {
  beforeAll(() => installDom());
  afterAll(() => removeDom());

  it("is assignable to KeyboardMapHandle, and its view to FullScreenMap's view prop (compile-time)", () => {
    const asKeyboard = (h: MapHandle): KeyboardMapHandle => h;
    const asFullScreenView = (v: MapView): NonNullable<FullScreenMapProps["view"]> => v;
    const { handle, view } = fakeMapHandle(document.createElement("div"));
    expect(asKeyboard(handle)).toBe(handle);
    expect(asFullScreenView(view)).toEqual({ center_x_m: 10, center_y_m: -20, resolution_m_per_px: 2 });
  });

  it("exposes a focusable target element, the resolution and a view-change subscription", () => {
    const target = document.createElement("div");
    target.tabIndex = 0;
    const { handle, view, listeners } = fakeMapHandle(target);
    expect(handle.getTargetElement().tabIndex).toBe(0);
    expect(handle.getResolution()).toBe(2);
    const seen: MapView[] = [];
    const unsubscribe = handle.onViewChange((v) => seen.push(v));
    for (const listener of listeners) listener(view);
    expect(seen).toEqual([view]);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  it("drives the real keyboard layer: arrows pan in screen pixels (up = negative dy), +/- zoom", () => {
    const target = document.createElement("div");
    target.tabIndex = 0;
    document.body.appendChild(target);
    const { handle, calls } = fakeMapHandle(target);
    const detach = attachKeyboardControls({ mapHandle: handle, panStepPx: 50 });
    target.focus();
    for (const key of ["ArrowUp", "ArrowRight", "+", "-"]) {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    detach();
    expect(calls).toEqual(["pan 0 -50", "pan 50 0", "zoom 1", "zoom -1"]);
    target.remove();
  });
});

describe("C10 WorkerClient carries retry (decision 11 Nov)", () => {
  it("requires retry() and isCrashed() on the interface (compile-time)", () => {
    const client: WorkerClient = {
      samplePoint: () => Promise.reject(new Error("unused")),
      computePlan: () => Promise.reject(new Error("unused")),
      postMessage: () => {},
      onMessage: () => () => {},
      terminate: () => {},
      retry: vi.fn(),
      isCrashed: () => false,
    };
    client.retry();
    expect(client.retry).toHaveBeenCalledOnce();
  });
});

describe("C10 stubs throw TODO(<owner id>) and are React components where they render", () => {
  it("throws the owner id from the c.4 register", async () => {
    expect(() => validateSite({} as never)).toThrow("TODO(T14.03)");
    expect(() => ProfileChart({} as never)).toThrow("TODO(T09.02)");
    expect(() => linkProfileToMap({} as never, {} as never)).toThrow("TODO(T09.05)");
    await expect(createMapSnapshot({} as never)).rejects.toThrow("TODO(T11.04)");
  });

  it("the implemented export throws its own reason, not a TODO marker (T11.02)", () => {
    // `exportPlan` is implemented (T11.02), so it refuses a plan without a computed result
    // with its own message instead of the c.4 stub's TODO marker.
    expect(() => exportPlan({} as never, {} as never)).toThrow(/exportPlan: the plan has no computed result yet/);
    expect(() => exportPlan({} as never, {} as never)).not.toThrow(/TODO\(/);
  });
});
