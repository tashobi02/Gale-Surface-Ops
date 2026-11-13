/**
 * T07.06 — createMap tests (FR-01, 02 §C.1, 02 §C.4, 04 §E; C10 v2 MapHandle).
 *
 * OpenLayers is real here: the view, the Mars projection and the controls are the ones the app runs. Only the
 * browser layout and `matchMedia` that jsdom lacks are stubbed (tests/ui/map/mapFixtures.ts).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type OlMap from "ol/Map.js";
import type BaseEvent from "ol/events/Event.js";
import { getTransform } from "./map/olTransform";
import { installDom, removeDom } from "./domHarness";
import { mockLoadedSite, sizedHost, stubReducedMotion, stubResizeObserver } from "./map/mapFixtures";
import { createMap } from "../../src/ui/map/createMap";
import { getMarsProjectionCode, projectedToLatLonE } from "../../src/ui/map/projection";
import type { MapHandle, MapView } from "../../src/ui/context";

const SITE = mockLoadedSite();
const CODE = getMarsProjectionCode(SITE.site);
const MARS_R = 3_396_190;

beforeAll(() => {
  installDom();
  stubResizeObserver();
});
afterAll(() => removeDom());

const open: MapHandle[] = [];
afterEach(() => {
  for (const handle of open.splice(0)) handle.destroy();
  document.body.innerHTML = "";
});

function make(host: HTMLElement = sizedHost(), extra: Partial<Parameters<typeof createMap>[0]> = {}): { handle: MapHandle; host: HTMLElement; map: OlMap } {
  const handle = createMap({ target: host, site: SITE, ...extra });
  open.push(handle);
  return { handle, host, map: handle.getMap<OlMap>() };
}

const pointerMove = (map: OlMap, coordinate: [number, number]): void => {
  map.dispatchEvent({ type: "pointermove", coordinate } as unknown as BaseEvent);
};

describe("createMap: projection and view (FR-01, 02 §C.4)", () => {
  it("builds the view on the Mars projection of the manifest, bounded by the AOI extent, never an Earth CRS", () => {
    const { map } = make();
    const view = map.getView();
    expect(view.getProjection().getCode()).toBe(CODE);
    expect(view.getProjection().getCode()).not.toMatch(/EPSG:(3857|4326)/);
    expect(view.getProjection().getUnits()).toBe("m");
    expect(view.getProjection().getExtent()).toEqual(SITE.site.aoi.extent_m);
  });

  it("creates no transform between the Mars projection and EPSG:3857 or EPSG:4326", () => {
    make();
    for (const earth of ["EPSG:3857", "EPSG:4326"]) {
      expect(getTransform(CODE, earth), `${CODE} -> ${earth}`).toBeNull();
      expect(getTransform(earth, CODE), `${earth} -> ${CODE}`).toBeNull();
    }
  });

  it("disables rotation: north stays up", () => {
    const { map } = make();
    const view = map.getView();
    view.setRotation(1.2);
    expect(view.getRotation()).toBe(0);
  });

  it("fits the AOI on open when the host has a size", () => {
    const { handle } = make(sizedHost(800, 600));
    const [cx, cy] = handle.getCenter();
    expect(cx).toBeCloseTo(0, 6);
    expect(cy).toBeCloseTo(0, 6);
    // 6000 m across the smaller dimension (600 px) minus the 24 px padding on each side
    expect(handle.getResolution()).toBeCloseTo(6000 / (600 - 48), 6);
  });

  it("fits the AOI when the host gets its size later (React mounts before layout)", () => {
    const host = sizedHost(0, 0);
    const { handle, map } = make(host);
    Object.defineProperty(host, "offsetWidth", { value: 1000, configurable: true });
    Object.defineProperty(host, "offsetHeight", { value: 500, configurable: true });
    map.updateSize();
    expect(handle.getResolution()).toBeCloseTo(6000 / (500 - 48), 6);
  });

  it("throws for an unknown target id instead of returning a map on a detached element", () => {
    expect(() => createMap({ target: "no-such-element", site: SITE })).toThrow(/no-such-element/);
  });

  it("accepts a target id", () => {
    const host = sizedHost();
    host.id = "map-host";
    const { handle } = make(undefined, { target: "map-host" });
    expect(host.contains(handle.getTargetElement())).toBe(true);
  });

  it("does not restyle the host: no forced position, no tabindex on it", () => {
    const host = sizedHost();
    host.style.position = "";
    make(host);
    expect(host.style.position).toBe("");
    expect(host.hasAttribute("tabindex")).toBe(false);
  });
});

describe("createMap: MapHandle v2", () => {
  it("implements every method of the C10 v2 handle", () => {
    const { handle } = make();
    for (const name of [
      "getMap", "getTargetElement", "fitExtent", "setCenter", "getCenter", "setZoom", "getZoom",
      "getResolution", "panBy", "zoomBy", "onViewChange", "destroy",
    ] as const) {
      expect(typeof handle[name], name).toBe("function");
    }
  });

  it("getTargetElement is a focusable element inside the host (tabindex 0, labelled)", () => {
    const { handle, host } = make();
    const el = handle.getTargetElement();
    expect(host.contains(el)).toBe(true);
    expect(el.getAttribute("tabindex")).toBe("0");
    expect(el.getAttribute("aria-label")).toMatch(/map/i);
    el.focus();
    expect(document.activeElement).toBe(el);
  });

  it("setCenter / getCenter / setZoom / getZoom work in projected metres", () => {
    const { handle } = make();
    handle.setCenter([100, -200]);
    expect(handle.getCenter()).toEqual([100, -200]);
    handle.setZoom(3);
    expect(handle.getZoom()).toBeCloseTo(3, 9);
  });

  it("fitExtent fits a sub-extent: centred on it, resolution from its size", () => {
    const restore = stubReducedMotion(true); // instant, so the result can be read at once
    try {
      const { handle } = make(sizedHost(800, 600));
      handle.fitExtent([-500, -500, 500, 500]);
      const [cx, cy] = handle.getCenter();
      expect(cx).toBeCloseTo(0, 6);
      expect(cy).toBeCloseTo(0, 6);
      expect(handle.getResolution()).toBeCloseTo(1000 / (600 - 48), 6);
    } finally {
      restore();
    }
  });

  it("panBy moves the view by screen pixels, y down: negative dy shows more north", () => {
    const { handle } = make();
    handle.setCenter([0, 0]);
    const res = handle.getResolution()!;
    handle.panBy(100, 0, { animate: false });
    expect(handle.getCenter()[0]).toBeCloseTo(100 * res, 6);
    handle.panBy(0, -50, { animate: false });
    expect(handle.getCenter()[1]).toBeCloseTo(50 * res, 6); // north is +y
    handle.panBy(-100, 50, { animate: false });
    expect(handle.getCenter()[0]).toBeCloseTo(0, 6);
    expect(handle.getCenter()[1]).toBeCloseTo(0, 6);
  });

  it("zoomBy changes the zoom level by delta (+1 halves the resolution)", () => {
    const { handle } = make();
    handle.setCenter([0, 0]);
    const before = handle.getResolution()!;
    handle.zoomBy(1, { animate: false });
    expect(handle.getResolution()).toBeCloseTo(before / 2, 6);
    handle.zoomBy(-1, { animate: false });
    expect(handle.getResolution()).toBeCloseTo(before, 6);
  });

  it("getResolution reads metres per pixel from the view", () => {
    const { handle, map } = make();
    expect(handle.getResolution()).toBe(map.getView().getResolution());
  });

  it("onViewChange emits {center_x_m, center_y_m, resolution_m_per_px}, not on subscribe, until unsubscribed", () => {
    const { handle } = make();
    const seen: MapView[] = [];
    const unsubscribe = handle.onViewChange((v) => seen.push(v));
    expect(seen).toEqual([]);

    handle.setCenter([40, 50]);
    expect(seen.at(-1)).toEqual({
      center_x_m: 40,
      center_y_m: 50,
      resolution_m_per_px: handle.getResolution(),
    });
    handle.zoomBy(1, { animate: false });
    expect(seen.at(-1)!.resolution_m_per_px).toBe(handle.getResolution());

    unsubscribe();
    const count = seen.length;
    handle.setCenter([60, 70]);
    expect(seen.length).toBe(count);
  });
});

describe("createMap: reduced motion (04 §E Motion)", () => {
  it("moves instantly with no options when prefers-reduced-motion is set", () => {
    const restore = stubReducedMotion(true);
    try {
      const { handle, map } = make();
      handle.setCenter([0, 0]);
      const res = handle.getResolution()!;
      handle.panBy(10, 0);
      expect(map.getView().getAnimating()).toBe(false);
      expect(handle.getCenter()[0]).toBeCloseTo(10 * res, 6);
      handle.zoomBy(1);
      expect(map.getView().getAnimating()).toBe(false);
      expect(handle.getResolution()).toBeCloseTo(res / 2, 6);
      handle.fitExtent([-500, -500, 500, 500]);
      expect(map.getView().getAnimating()).toBe(false);
    } finally {
      restore();
    }
  });

  it("animates by default without the preference, and an explicit animate:false is still instant", () => {
    const restore = stubReducedMotion(false);
    try {
      const { handle, map } = make();
      handle.setCenter([0, 0]);
      handle.panBy(10, 0);
      expect(map.getView().getAnimating()).toBe(true);
      map.getView().cancelAnimations();

      const res = handle.getResolution()!;
      const x = handle.getCenter()[0];
      handle.panBy(10, 0, { animate: false });
      expect(map.getView().getAnimating()).toBe(false);
      expect(handle.getCenter()[0]).toBeCloseTo(x + 10 * res, 6);
    } finally {
      restore();
    }
  });
});

describe("createMap: fitExtent options (FD-063)", () => {
  it("fitExtent(extent, { animate: false }) is instant without the reduced-motion preference, and a plain call animates", () => {
    const restore = stubReducedMotion(false);
    try {
      const { handle, map } = make(sizedHost(800, 600));
      map.getView().cancelAnimations();
      handle.fitExtent([-500, -500, 500, 500], { animate: false });
      expect(map.getView().getAnimating()).toBe(false);
      expect(handle.getCenter()[0]).toBeCloseTo(0, 6);
      handle.fitExtent([-1500, -1500, 1500, 1500]);
      expect(map.getView().getAnimating()).toBe(true);
    } finally {
      restore();
    }
  });

  it("under prefers-reduced-motion the fit is instant even when animation is asked for", () => {
    const restore = stubReducedMotion(true);
    try {
      const { handle, map } = make(sizedHost(800, 600));
      handle.fitExtent([-500, -500, 500, 500], { animate: true });
      expect(map.getView().getAnimating()).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("createMap: coordinate readout, north arrow, scale bar (FR-01, FR-15)", () => {
  const readoutOf = (host: HTMLElement): HTMLElement => host.querySelector<HTMLElement>("[data-testid='coord-readout']")!;

  it("shows — marked unavailable until a position is measured, with the provenance class and a real source id", () => {
    const { host } = make();
    const readout = readoutOf(host);
    expect(readout.textContent).toBe("—");
    expect(readout.getAttribute("data-unavailable")).toBe("true");
    expect(readout.getAttribute("data-provenance")).toBe("derived");
    expect(readout.getAttribute("data-source")).toMatch(/^unavailable:/);
  });

  it("on pointermove shows planetocentric lat and east-positive lon to 5 decimals plus projected x/y metres", () => {
    const { host, map } = make();
    pointerMove(map, [1000, 2000]);
    const readout = readoutOf(host);

    // Independent maths: eqc inverse on the Mars sphere from the manifest string (lat_ts = lat_0 = -4.70, lon_0 = 137.38)
    const lat = -4.7 + (2000 / MARS_R) * (180 / Math.PI);
    const lon = 137.38 + (1000 / (MARS_R * Math.cos((4.7 * Math.PI) / 180))) * (180 / Math.PI);
    const text = readout.textContent!;
    expect(text).toContain(`${lat.toFixed(5).replace("-", "−")}°`);
    expect(text).toContain(`${lon.toFixed(5)}°E`);
    expect(text).toContain("x 1000 m");
    expect(text).toContain("y 2000 m");
    // and it is the same as the projection module's inverse
    const inv = projectedToLatLonE(SITE.site, 1000, 2000);
    expect(text).toContain(inv.lon_e.toFixed(5));

    expect(readout.hasAttribute("data-unavailable")).toBe(false);
    expect(readout.getAttribute("data-provenance")).toBe("derived");
  });

  it("cites the working projection, not a dataset: derived, source proj:IAU_2015:49900 (FD-080)", () => {
    const { host, map } = make();
    pointerMove(map, [0, 0]);
    const readout = readoutOf(host);
    expect(readout.getAttribute("data-provenance")).toBe("derived");
    expect(readout.getAttribute("data-source")).toBe("proj:IAU_2015:49900");
    expect(host.querySelector(".ol-scale-line")!.getAttribute("data-source")).toBe("proj:IAU_2015:49900");
  });

  it("goes back to — when the pointer leaves the map", () => {
    const { handle, host, map } = make();
    pointerMove(map, [10, 10]);
    handle.getTargetElement().dispatchEvent(new window.Event("pointerleave"));
    expect(readoutOf(host).textContent).toBe("—");
    expect(readoutOf(host).getAttribute("data-unavailable")).toBe("true");
  });

  it("mounts a north arrow (top right) with a word, and a scale bar", () => {
    const { host } = make();
    const arrow = host.querySelector<HTMLElement>("[data-testid='north-arrow']")!;
    expect(arrow).not.toBeNull();
    expect(arrow.textContent).toContain("N");
    expect(arrow.getAttribute("role")).toBe("img");
    expect(host.querySelector(".ol-scale-line")).not.toBeNull();
  });

  it("uses design tokens and no text below 12 px (04 §C.2)", () => {
    const { host } = make();
    const styled = [...host.querySelectorAll<HTMLElement>("[data-testid], .ol-scale-line")];
    expect(styled.length).toBeGreaterThanOrEqual(3);
    for (const el of styled) {
      const style = el.getAttribute("style") ?? "";
      expect(style, el.className || el.dataset.testid).not.toMatch(/--color-fg/);
      expect(style).not.toMatch(/font-size:\s*(1[01]|[0-9])px/);
    }
    expect(readoutOf(host).getAttribute("style")).toContain("var(--text-1)");
    expect(readoutOf(host).getAttribute("style")).toContain("var(--text-micro)");
  });
});

describe("createMap: keyboard and destroy (04 §E, T13.06)", () => {
  const key = (el: EventTarget, k: string): void => {
    el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  };

  it("mounts attachKeyboardControls: arrows pan and +/- zoom while the map has focus", () => {
    const restore = stubReducedMotion(true);
    try {
      const { handle } = make();
      handle.setCenter([0, 0]);
      const res = handle.getResolution()!;
      const el = handle.getTargetElement();
      el.focus();
      key(el, "ArrowRight");
      expect(handle.getCenter()[0]).toBeCloseTo(50 * res, 6);
      key(el, "ArrowUp");
      expect(handle.getCenter()[1]).toBeCloseTo(50 * res, 6);
      key(el, "+");
      expect(handle.getResolution()).toBeCloseTo(res / 2, 6);
    } finally {
      restore();
    }
  });

  it("does not pan when the map does not have focus", () => {
    const { handle } = make();
    handle.setCenter([0, 0]);
    document.body.focus();
    key(window, "ArrowRight");
    expect(handle.getCenter()).toEqual([0, 0]);
  });

  it("keyboard: false mounts no key handler", () => {
    const restore = stubReducedMotion(true);
    try {
      const { handle } = make(undefined, { keyboard: false });
      handle.setCenter([0, 0]);
      handle.getTargetElement().focus();
      key(handle.getTargetElement(), "ArrowRight");
      expect(handle.getCenter()).toEqual([0, 0]);
    } finally {
      restore();
    }
  });

  it("destroy removes the map DOM, the key handler and the view listeners, and is safe to call twice", () => {
    const restore = stubReducedMotion(true);
    try {
      const host = sizedHost();
      const { handle, map } = make(host);
      const listener = vi.fn();
      handle.onViewChange(listener);
      const el = handle.getTargetElement();
      handle.destroy();

      expect(host.childElementCount).toBe(0);
      expect(host.querySelector("[data-testid]")).toBeNull();

      el.focus();
      const view = map.getView();
      const before = view.getCenter();
      key(window, "ArrowRight");
      expect(view.getCenter()).toEqual(before);

      view.setCenter([5, 5]);
      expect(listener).not.toHaveBeenCalled();
      expect(() => handle.destroy()).not.toThrow();
    } finally {
      restore();
    }
  });
});
