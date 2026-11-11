/**
 * T07.11 — POI layer and selection (FR-04, 03 SCR-06, 04 §C.3, §C.5, §F; C11 POI selection is TODO(decision)).
 * Real OpenLayers and the mock site's own POIs.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type Style from "ol/style/Style.js";
import type CircleStyle from "ol/style/Circle.js";
import type { POIFeature } from "@marswalk/protocol";
import { createPoiLayer, type PoiLayerController } from "../../src/ui/map/poiLayer";
import { LAYER_Z_INDEX, type LoadedSite } from "../../src/ui/context";
import { installDom, removeDom } from "./domHarness";
import { loadedSiteFrom, mockLoadedSite, mockManifest } from "./map/mapFixtures";

beforeAll(() => installDom());
afterAll(() => removeDom());

const TOKENS: Record<string, string> = {
  "--text-1": "#ECEFF2",
  "--void": "#0B0D10",
  "--route": "#4CC9F0",
  "--font-mono": '"IBM Plex Mono", ui-monospace, monospace',
  "--text-micro": "12px",
  "--selection-width": "2px",
};
const readToken = (name: string): string => TOKENS[name] ?? "";
const rgba = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, 1)`;
};

const SITE = mockLoadedSite();
const POI = [...SITE.pois.values()][0]; // Boxwork ridge at (410, 325)

const made: PoiLayerController[] = [];
afterEach(() => {
  made.splice(0).forEach((c) => c.destroy());
  document.body.innerHTML = "";
});
function make(site: LoadedSite = SITE, extra: Record<string, unknown> = {}): PoiLayerController {
  const c = createPoiLayer(site, { readToken, ...extra });
  made.push(c);
  return c;
}

/** The styles a marker is drawn with right now. */
function stylesOf(c: PoiLayerController, id = POI.properties.poi_id): Style[] {
  const feature = c.layer.getSource()!.getFeatures().find((f) => f.get("poi_id") === id)!;
  const style = c.layer.getStyleFunction()!(feature, 1);
  return (Array.isArray(style) ? style : [style]) as Style[];
}
const labelOf = (styles: Style[]): string | null => styles.map((s) => s.getText()?.getText() as string | undefined).find((t) => t !== undefined) ?? null;
const markerOf = (styles: Style[]): CircleStyle => styles.find((s) => s.getImage())!.getImage() as CircleStyle;

function poiWith(id: string, coordinates: unknown): POIFeature {
  return { ...POI, geometry: { type: "Point", coordinates: coordinates as [number, number] }, properties: { ...POI.properties, poi_id: id, name: `POI ${id}` } };
}

describe("createPoiLayer: markers from the boot POI map (FR-04)", () => {
  it("draws one marker per POI in projected metres at the C10 POI slot", () => {
    const c = make();
    expect(c.layer.getZIndex()).toBe(LAYER_Z_INDEX.POIS);
    const features = c.layer.getSource()!.getFeatures();
    expect(features).toHaveLength(SITE.pois.size);
    expect(features[0].getGeometry()!.getType()).toBe("Point");
    expect((features[0].getGeometry() as import("ol/geom/Point.js").default).getCoordinates()).toEqual(POI.geometry.coordinates);
    expect(c.skipped()).toEqual([]);
  });

  it("skips a POI with bad coordinates and says why", () => {
    const site = loadedSiteFrom(mockManifest(), [POI, poiWith("bad", [Number.NaN, 1]), poiWith("worse", "x")]);
    const c = make(site);
    expect(c.layer.getSource()!.getFeatures()).toHaveLength(1);
    expect(c.skipped().map((s) => s.poi_id)).toEqual(["bad", "worse"]);
    expect(c.skipped()[0].reason).toMatch(/coordinates/);
  });

  it("default marker: 24 px, white pin (--text-1) with a --void outline, no label", () => {
    const styles = stylesOf(make());
    const marker = markerOf(styles);
    expect(marker.getRadius() * 2).toBe(24);
    expect(marker.getFill()!.getColor()).toBe(rgba(TOKENS["--text-1"]));
    expect(marker.getStroke()!.getColor()).toBe(rgba(TOKENS["--void"]));
    expect(labelOf(styles)).toBeNull();
  });

  it("hover shows the label; selected is a --route pin with a ring and its label, not colour alone (04 §C.5)", () => {
    const c = make();
    c.setHover(POI.properties.poi_id);
    expect(labelOf(stylesOf(c))).toBe("Boxwork ridge");
    c.setHover(null);
    expect(labelOf(stylesOf(c))).toBeNull();

    c.selectPoi(POI.properties.poi_id);
    const styles = stylesOf(c);
    const marker = markerOf(styles);
    expect(marker.getFill()!.getColor()).toBe(rgba(TOKENS["--route"]));
    expect(marker.getStroke()!.getWidth()).toBeGreaterThan(markerOf(stylesOf(make())).getStroke()!.getWidth()!);
    expect(marker.getStroke()!.getColor()).toBe(rgba(TOKENS["--text-1"]));
    expect(labelOf(styles)).toBe("Boxwork ridge");
  });

  it("the label is the 12 px token size in the mono token font", () => {
    const c = make();
    c.setHover(POI.properties.poi_id);
    const text = stylesOf(c).find((s) => s.getText())!.getText()!;
    expect(text.getFont()).toBe(`12px ${TOKENS["--font-mono"]}`);
  });

  it("names a missing token instead of falling back to a hex colour", () => {
    expect(() => make(SITE, { readToken: (n: string) => (n === "--route" ? "" : TOKENS[n]) })).toThrow("--route");
  });

  it("the module has no hard-coded colour and does not drive the waypoint selection with POI ids", () => {
    const source = readFileSync(resolve(__dirname, "../../src/ui/map/poiLayer.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(\s*\d/);
    expect(source).not.toMatch(/selectWaypoint|innerHTML/);
  });
});

describe("POI selection is separate from waypoint selection (C11 TODO(decision))", () => {
  it("selectPoi records the POI and calls onSelectPoi with the POI id; null clears", () => {
    const onSelectPoi = vi.fn();
    const c = make(SITE, { onSelectPoi });
    expect(c.getSelectedPoiId()).toBeNull();
    expect(c.selectPoi(POI.properties.poi_id)).toBe(true);
    expect(c.getSelectedPoiId()).toBe(POI.properties.poi_id);
    expect(c.selectPoi(null)).toBe(true);
    expect(c.getSelectedPoiId()).toBeNull();
    expect(onSelectPoi.mock.calls).toEqual([[POI.properties.poi_id], [null]]);
  });

  it("ignores an id that is not a POI of the site and reports it", () => {
    const onSelectPoi = vi.fn();
    const c = make(SITE, { onSelectPoi });
    expect(c.selectPoi("poi-does-not-exist")).toBe(false);
    expect(c.getSelectedPoiId()).toBeNull();
    expect(onSelectPoi).not.toHaveBeenCalled();
  });

  it("selecting the same POI again does not call back twice", () => {
    const onSelectPoi = vi.fn();
    const c = make(SITE, { onSelectPoi });
    c.selectPoi(POI.properties.poi_id);
    c.selectPoi(POI.properties.poi_id);
    expect(onSelectPoi).toHaveBeenCalledTimes(1);
  });
});

describe("show/hide for SCR-03", () => {
  it("starts visible unless told otherwise and toggles the layer", () => {
    expect(make().isVisible()).toBe(true);
    const hidden = make(SITE, { initialVisible: false });
    expect(hidden.isVisible()).toBe(false);
    hidden.setVisible(true);
    expect(hidden.layer.getVisible()).toBe(true);
  });
});

describe("map pointer: hover and click (pixel tolerance)", () => {
  function fakeMap(resolution = 2) {
    const listeners = new Map<string, Set<(e: { coordinate: number[] }) => void>>();
    const target = document.createElement("div");
    document.body.appendChild(target);
    const map = {
      on: (type: string, fn: (e: { coordinate: number[] }) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      un: (type: string, fn: (e: { coordinate: number[] }) => void) => listeners.get(type)?.delete(fn),
    };
    return {
      handle: { getMap: () => map, getResolution: () => resolution, getTargetElement: () => target },
      listeners,
      target,
      emit: (type: string, coordinate: number[]) => listeners.get(type)?.forEach((fn) => fn({ coordinate })),
    };
  }

  it("hover within the marker radius labels the POI; farther does not", () => {
    const c = make();
    const { handle, emit } = fakeMap(2);
    c.attach(handle as never);
    emit("pointermove", [410 + 20, 325]); // 20 m = 10 px at 2 m/px: inside the 12 px marker
    expect(labelOf(stylesOf(c))).toBe("Boxwork ridge");
    emit("pointermove", [410 + 40, 325]); // 20 px
    expect(labelOf(stylesOf(c))).toBeNull();
  });

  it("a click on a marker selects it; a click elsewhere leaves the selection (the inspector owns empty clicks)", () => {
    const onSelectPoi = vi.fn();
    const c = make(SITE, { onSelectPoi });
    const { handle, emit } = fakeMap(2);
    c.attach(handle as never);
    emit("singleclick", [0, 0]);
    expect(onSelectPoi).not.toHaveBeenCalled();
    emit("singleclick", [410, 325]);
    expect(onSelectPoi).toHaveBeenCalledWith(POI.properties.poi_id);
  });

  it("getPoiAt and getHoverLabel resolve a position within a tolerance in metres", () => {
    const c = make();
    expect(c.getPoiAt([410, 325], 1)!.properties.poi_id).toBe(POI.properties.poi_id);
    expect(c.getPoiAt([0, 0], 5)).toBeNull();
    expect(c.getHoverLabel([410, 325], 1)).toBe("Boxwork ridge");
  });

  it("detach and destroy remove the listeners", () => {
    const c = make();
    const { handle, listeners } = fakeMap();
    const detach = c.attach(handle as never);
    expect(listeners.get("pointermove")!.size).toBe(1);
    detach();
    expect(listeners.get("pointermove")!.size).toBe(0);
    expect(listeners.get("singleclick")!.size).toBe(0);
    c.attach(handle as never);
    c.destroy();
    expect(listeners.get("pointermove")!.size).toBe(0);
    expect(() => c.destroy()).not.toThrow();
  });
});

describe("keyboard focus path: a list of the POIs, one button each (04 §F, §A.3 #9)", () => {
  it("lists every POI by name as a real button, in the manifest order, as text nodes", () => {
    const site = loadedSiteFrom(mockManifest(), [POI, poiWith("b", [1, 2])]);
    const c = make(site);
    const buttons = [...c.listElement.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Boxwork ridge", "POI b"]);
    expect(buttons.map((b) => b.dataset.poiId)).toEqual([POI.properties.poi_id, "b"]);
    expect(buttons.every((b) => b.type === "button")).toBe(true);
    expect(c.listElement.getAttribute("aria-label")).toMatch(/points of interest/i);
  });

  it("each list button carries the POI's own provenance class and a source id (FR-15; 05 POI.provenance)", () => {
    const c = make(loadedSiteFrom(mockManifest(), [POI]));
    const button = c.listElement.querySelector<HTMLButtonElement>("button")!;
    expect(button.getAttribute("data-provenance")).toBe(POI.properties.provenance);
    expect(button.getAttribute("data-source")).toBe(`pois:${POI.properties.poi_id}`);
  });

  it("focusing a button shows that POI's label and a focus ring on the map; leaving clears it", () => {
    const c = make();
    document.body.appendChild(c.listElement);
    const button = c.listElement.querySelector<HTMLButtonElement>("button")!;
    button.focus();
    const focused = stylesOf(c);
    expect(labelOf(focused)).toBe("Boxwork ridge");
    expect(focused.length).toBeGreaterThan(1); // the ring is drawn as extra styles around the marker
    button.blur();
    expect(labelOf(stylesOf(c))).toBeNull();
    expect(stylesOf(c)).toHaveLength(1);
  });

  it("activating a button selects the POI (Enter and Space click a button)", () => {
    const onSelectPoi = vi.fn();
    const c = make(SITE, { onSelectPoi });
    document.body.appendChild(c.listElement);
    c.listElement.querySelector<HTMLButtonElement>("button")!.click();
    expect(onSelectPoi).toHaveBeenCalledWith(POI.properties.poi_id);
    expect(c.getSelectedPoiId()).toBe(POI.properties.poi_id);
    expect(c.listElement.querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("is hidden until it has focus, then visible with the white focus ring", () => {
    const c = make();
    document.body.appendChild(c.listElement);
    const hiddenStyle = c.listElement.getAttribute("style") ?? "";
    expect(hiddenStyle).toMatch(/clip/);
    c.listElement.querySelector<HTMLButtonElement>("button")!.focus();
    const shown = c.listElement.getAttribute("style") ?? "";
    expect(shown).not.toMatch(/clip/);
    expect(shown).toContain("var(--panel)");
    c.listElement.querySelector<HTMLButtonElement>("button")!.blur();
    expect(c.listElement.getAttribute("style")).toMatch(/clip/);
  });

  it("attach mounts the list in the map's target element, detach removes it", () => {
    const c = make();
    const { handle, target } = fakeMapForList();
    const detach = c.attach(handle as never);
    expect(target.contains(c.listElement)).toBe(true);
    detach();
    expect(target.contains(c.listElement)).toBe(false);
  });

  function fakeMapForList() {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const map = { on() {}, un() {} };
    return { handle: { getMap: () => map, getResolution: () => 2, getTargetElement: () => target }, target };
  }
});
