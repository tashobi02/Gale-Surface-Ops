/**
 * T07.18 — Exploration Zone layer (FR-45, 04 §A.3 "status colours mean status only", §C.1): POIs styled by `stop_type` with a
 * shape and a word. Real OpenLayers and the mock site's own POI, plus two more POIs of the other stop types.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type RegularShape from "ol/style/RegularShape.js";
import type Style from "ol/style/Style.js";
import type { POIFeature } from "@marswalk/protocol";
import { createEzLayer, EZ_STOP_TYPES, type EzLayerController } from "../../src/ui/map/ezLayer";
import { LAYER_Z_INDEX, type LoadedSite } from "../../src/ui/context";
import { installDom, removeDom } from "./domHarness";
import { loadedSiteFrom, mockLoadedSite, mockManifest } from "./map/mapFixtures";

beforeAll(() => installDom());
afterAll(() => removeDom());

const TOKENS: Record<string, string> = {
  "--text-1": "#ECEFF2",
  "--void": "#0B0D10",
  "--font-mono": '"IBM Plex Mono", ui-monospace, monospace',
  "--text-micro": "12px",
  "--caution": "#FFB020",
  "--warning": "#FF4D4D",
  "--nominal": "#3DDC97",
  "--advisory": "#4CC9F0",
  "--unknown": "#B8A9FF",
};
const readToken = (name: string): string => TOKENS[name] ?? "";

const BASE = [...mockLoadedSite().pois.values()][0];
const poi = (id: string, stop_type: unknown, at: [number, number]): POIFeature => ({
  ...BASE,
  geometry: { type: "Point", coordinates: at },
  properties: { ...BASE.properties, poi_id: id, name: `POI ${id}`, stop_type: stop_type as POIFeature["properties"]["stop_type"] },
});
const SITE: LoadedSite = loadedSiteFrom(mockManifest(), [poi("p-sci", "science", [0, 0]), poi("p-res", "resource", [100, 0]), poi("p-eng", "engineering", [200, 0])]);

const made: EzLayerController[] = [];
afterEach(() => made.splice(0).forEach((c) => c.destroy()));
const make = (site: LoadedSite = SITE): EzLayerController => {
  const c = createEzLayer(site, { readToken });
  made.push(c);
  return c;
};
const stylesOf = (c: EzLayerController, id: string): Style[] => {
  const feature = c.layer.getSource()!.getFeatures().find((f) => f.get("poi_id") === id)!;
  const style = c.layer.getStyleFunction()!(feature, 1);
  return (Array.isArray(style) ? style : [style]) as Style[];
};
const shapeOf = (styles: Style[]): RegularShape => styles.find((s) => s.getImage())!.getImage() as RegularShape;
const wordOf = (styles: Style[]): string | undefined => styles.map((s) => s.getText()?.getText() as string | undefined).find((t) => t !== undefined);

describe("createEzLayer: POIs by stop_type (FR-45, T07.18)", () => {
  it("stop types carry shape and word: each type has its own number of corners and its own word, on every marker and in the legend", () => {
    const c = make();
    const corners = new Map<string, number>();
    for (const [id, type, word] of [["p-sci", "science", "SCIENCE"], ["p-res", "resource", "RESOURCE"], ["p-eng", "engineering", "ENGINEERING"]] as const) {
      const styles = stylesOf(c, id);
      expect(wordOf(styles), `${type} word`).toBe(word);
      corners.set(type, shapeOf(styles).getPoints());
      expect(EZ_STOP_TYPES[type].word).toBe(word);
    }
    expect(new Set(corners.values()).size, "three different shapes").toBe(3);
    expect(c.legend().map((e) => [e.stopType, e.word, e.shape])).toEqual([
      ["science", "SCIENCE", "triangle"],
      ["resource", "RESOURCE", "square"],
      ["engineering", "ENGINEERING", "hexagon"],
    ]);
  });

  it("is neutral chrome: the markers use text and void tokens, never a status colour (04 §A.3 #1)", () => {
    const c = make();
    const status = new Set(["#FFB020", "#FF4D4D", "#3DDC97", "#4CC9F0", "#B8A9FF"].map((h) => h.toLowerCase()));
    for (const id of ["p-sci", "p-res", "p-eng"]) {
      const colours = stylesOf(c, id).flatMap((s) => [s.getImage() && (s.getImage() as RegularShape).getFill()?.getColor(), s.getText()?.getFill()?.getColor()]).filter(Boolean) as string[];
      expect(colours.length).toBeGreaterThan(0);
      for (const colour of colours) {
        const hex = typeof colour === "string" && colour.startsWith("rgba") ? colour : String(colour);
        expect([...status].some((h) => hex.toLowerCase().includes(h))).toBe(false);
        expect(hex).toBe("rgba(236, 239, 242, 1)");
      }
    }
  });

  it("sits in the layer order just under the POI pins and over the route, and shows or hides as one layer", () => {
    const c = make();
    expect(c.layer.getZIndex()).toBe(LAYER_Z_INDEX.EZ);
    expect(LAYER_Z_INDEX.EZ).toBeGreaterThan(LAYER_Z_INDEX.WAYPOINTS);
    expect(LAYER_Z_INDEX.EZ).toBeLessThan(LAYER_Z_INDEX.POIS);
    expect(c.isVisible()).toBe(true);
    c.setVisible(false);
    expect(c.layer.getVisible()).toBe(false);
  });

  it("a POI with no valid stop_type or bad coordinates is skipped and listed, never defaulted to a type", () => {
    const site = loadedSiteFrom(mockManifest(), [poi("p-ok", "science", [0, 0]), poi("p-bad", "lava", [1, 1]), poi("p-xy", "resource", ["a", 1] as unknown as [number, number])]);
    const c = make(site);
    expect(c.layer.getSource()!.getFeatures().map((f) => f.get("poi_id"))).toEqual(["p-ok"]);
    expect(c.skipped().map((s) => s.poi_id).sort()).toEqual(["p-bad", "p-xy"]);
  });

  it("throws naming the token when a design token is missing (FD-065)", () => {
    expect(() => createEzLayer(SITE, { readToken: (n) => (n === "--void" ? "" : TOKENS[n] ?? "") })).toThrow("--void");
  });
});
