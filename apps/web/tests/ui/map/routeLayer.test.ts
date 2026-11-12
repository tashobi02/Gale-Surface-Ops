/**
 * Route layer (T09.01; FR-07, FR-10; 04 §C.1 map overlays, §C.5 map annotations; 02 §C.1 projected metres).
 * Originally by Saba Atharique (#178); reworked in the review: token colours, `unknown` severity, no duplicate point.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import VectorLayer from "ol/layer/Vector.js";
import type VectorSource from "ol/source/Vector.js";
import type Style from "ol/style/Style.js";
import type { Leg, NoRouteLeg, OkLeg, Warning } from "@marswalk/protocol";
import { createRouteLayer } from "../../../src/ui/map/routeLayer";
import { LAYER_Z_INDEX } from "../../../src/ui/context";
import { fakePlanStore, resultOf } from "../planStoreFake";
import { installDom, removeDom } from "../domHarness";
import { applyTokens } from "../tokensDom";

let tokens: Record<string, string>;
beforeEach(() => {
  installDom();
  tokens = applyTokens();
});
afterEach(() => removeDom());

const okLeg = (geometry: [number, number][], overrides: Partial<OkLeg> = {}): OkLeg => ({
  from: "wp-0",
  to: "wp-1",
  status: "OK",
  distance_m: 141.4,
  walk_time_min: 15,
  climb_m: 10,
  descent_m: 0,
  max_slope_deg: 5,
  geometry,
  cell_path_length: 30,
  profile: { dist_m: [], elev_m: [], slope_class: [] },
  ...overrides,
});

const noRouteLeg: NoRouteLeg = {
  from: "wp-0",
  to: "wp-1",
  status: "NO_ROUTE",
  reason: "DISCONNECTED_BY_SLOPE",
  nearest_reachable: { x_m: 40, y_m: 40 },
};

const warning = (overrides: Partial<Warning> = {}): Warning => ({
  code: "CAUTION_SLOPE",
  severity: "caution",
  leg: 0,
  from_m: 30,
  to_m: 70,
  message: "Caution slope section",
  ...overrides,
});

function featuresOf(layer: VectorLayer<VectorSource>, type: string): Feature[] {
  return layer.getSource()!.getFeatures().filter((f) => f.get("type") === type);
}

function stylesOf(layer: VectorLayer<VectorSource>, feature: Feature): Style[] {
  const fn = layer.getStyleFunction();
  if (!fn) throw new Error("layer has no style function");
  const out = fn(feature, 1);
  if (!out) return [];
  return Array.isArray(out) ? out : [out];
}

const coordsOf = (f: Feature): number[][] => (f.getGeometry() as LineString).getCoordinates();

describe("createRouteLayer: layer and data (T09.01)", () => {
  it("is a vector layer at the fixed FR-02 route position, below POIs and above hazards", () => {
    const { store } = fakePlanStore();
    const layer = createRouteLayer(store);
    expect(layer).toBeInstanceOf(VectorLayer);
    expect(layer.getZIndex()).toBe(LAYER_Z_INDEX.ROUTE);
    expect(layer.getZIndex()).toBeLessThan(LAYER_Z_INDEX.POIS);
    expect(layer.getZIndex()).toBeGreaterThan(LAYER_Z_INDEX.HAZARDS);
  });

  it("draws every OK leg from Leg.geometry in projected metres and clears when the plan is empty", () => {
    const fake = fakePlanStore();
    const layer = createRouteLayer(fake.store);
    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
    const geometry: [number, number][] = [
      [0, 0],
      [50, 50],
      [100, 100],
    ];
    fake.emit({ status: "OK", result: resultOf({ legs: [okLeg(geometry)] }) });
    const legs = featuresOf(layer, "ok_leg");
    expect(legs).toHaveLength(1);
    expect(coordsOf(legs[0]!)).toEqual(geometry);
    fake.emit({ status: "Empty", result: null });
    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("clears on an Error state, keeps the previous route while Computing", () => {
    const fake = fakePlanStore({ result: resultOf({ legs: [okLeg([[0, 0], [10, 10]])] }) });
    const layer = createRouteLayer(fake.store);
    expect(featuresOf(layer, "ok_leg")).toHaveLength(1);
    fake.emit({ status: "Computing" });
    expect(featuresOf(layer, "ok_leg")).toHaveLength(1);
    fake.emit({ status: "Error", result: null });
    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("draws a NO_ROUTE leg from its start waypoint to nearest_reachable, and nothing without one", () => {
    const fake = fakePlanStore({ status: "Partial", result: resultOf({ status: "PARTIAL", legs: [noRouteLeg] }) });
    const layer = createRouteLayer(fake.store);
    const dashed = featuresOf(layer, "no_route_leg");
    expect(dashed).toHaveLength(1);
    expect(coordsOf(dashed[0]!)).toEqual([
      [0, 0],
      [40, 40],
    ]);
    const { nearest_reachable: _omit, ...blocked } = noRouteLeg;
    fake.emit({ result: resultOf({ status: "PARTIAL", legs: [{ ...blocked, reason: "START_BLOCKED" } as Leg] }) });
    expect(featuresOf(layer, "no_route_leg")).toHaveLength(0);
  });

  it("does not rebuild the features when only the hover changes, and applies the hover leg", () => {
    const fake = fakePlanStore({ result: resultOf({ legs: [okLeg([[0, 0], [10, 10]])] }) });
    const layer = createRouteLayer(fake.store);
    const before = featuresOf(layer, "ok_leg")[0]!;
    const widthAt = (): number => stylesOf(layer, before).map((s) => s.getStroke()!.getWidth()!).sort((a, b) => a - b).at(-1)!;
    const rest = widthAt();
    fake.emit({ hover: { leg_index: 0 } });
    expect(featuresOf(layer, "ok_leg")[0]).toBe(before);
    expect(widthAt()).toBeGreaterThan(rest);
    fake.emit({ hover: null });
    expect(widthAt()).toBe(rest);
  });

  it("exposes setHover for the profile link and unsubscribes from the store on destroy", () => {
    const fake = fakePlanStore({ result: resultOf({ legs: [okLeg([[0, 0], [10, 10]])] }) });
    const layer = createRouteLayer(fake.store);
    const leg = featuresOf(layer, "ok_leg")[0]!;
    const rest = Math.max(...stylesOf(layer, leg).map((s) => s.getStroke()!.getWidth()!));
    layer.setHover({ leg_index: 0 });
    expect(Math.max(...stylesOf(layer, leg).map((s) => s.getStroke()!.getWidth()!))).toBeGreaterThan(rest);
    expect(fake.listenerCount()).toBe(1);
    layer.destroy();
    expect(fake.listenerCount()).toBe(0);
    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });
});

describe("createRouteLayer: styles come from the tokens (04 §C.1, §C.5)", () => {
  it("draws an OK leg as a 4 px route line over a casing of void 2 px wider on each side", () => {
    const fake = fakePlanStore({ result: resultOf({ legs: [okLeg([[0, 0], [10, 10]])] }) });
    const layer = createRouteLayer(fake.store);
    const styles = stylesOf(layer, featuresOf(layer, "ok_leg")[0]!);
    expect(styles).toHaveLength(2);
    const [casing, line] = styles.map((s) => s.getStroke()!);
    expect(line!.getColor()).toBe(tokens["--route"]);
    expect(line!.getWidth()).toBe(4);
    expect(casing!.getColor()).toBe(tokens["--void"]);
    expect(casing!.getWidth()).toBe(4 + 2 * 2);
  });

  it("follows a changed token: no hex is copied into the layer", () => {
    const fake = fakePlanStore({ result: resultOf({ legs: [okLeg([[0, 0], [10, 10]])] }) });
    const layer = createRouteLayer(fake.store);
    document.documentElement.style.setProperty("--route", "#010203");
    const line = stylesOf(layer, featuresOf(layer, "ok_leg")[0]!)[1]!.getStroke()!;
    expect(line.getColor()).toBe("#010203");
  });

  it("draws NO_ROUTE as a dashed unknown line (04 §C.5), not a solid route", () => {
    const fake = fakePlanStore({ status: "Partial", result: resultOf({ status: "PARTIAL", legs: [noRouteLeg] }) });
    const layer = createRouteLayer(fake.store);
    const stroke = stylesOf(layer, featuresOf(layer, "no_route_leg")[0]!)[0]!.getStroke()!;
    expect(stroke.getColor()).toBe(tokens["--unknown"]);
    expect(stroke.getLineDash()?.length).toBeGreaterThan(0);
  });

  const hazardStroke = (severity: Warning["severity"]): { color: unknown; dash: number[] | null | undefined } => {
    const fake = fakePlanStore({
      result: resultOf({ status: "OVER_LIMITS", legs: [okLeg([[0, 0], [100, 0]])], warnings: [warning({ severity })] }),
    });
    const layer = createRouteLayer(fake.store);
    const stroke = stylesOf(layer, featuresOf(layer, "hazard_segment")[0]!)[0]!.getStroke()!;
    return { color: stroke.getColor(), dash: stroke.getLineDash() };
  };

  it("overlays a caution stretch in caution and a blocked stretch in warning", () => {
    expect(hazardStroke("caution").color).toBe(tokens["--caution"]);
    expect(hazardStroke("blocked").color).toBe(tokens["--warning"]);
  });

  it("overlays an unknown-severity stretch in unknown, dotted, never as caution", () => {
    const unknown = hazardStroke("unknown");
    expect(unknown.color).toBe(tokens["--unknown"]);
    expect(unknown.color).not.toBe(tokens["--caution"]);
    // Dotted: a dash no longer than the gap, distinct from the caution and blocked patterns (shape, not colour alone).
    expect(unknown.dash).toBeDefined();
    expect(unknown.dash![0]).toBeLessThanOrEqual(unknown.dash![1]!);
    expect(unknown.dash).not.toEqual(hazardStroke("caution").dash);
    expect(hazardStroke("blocked").dash).not.toEqual(hazardStroke("caution").dash);
  });

  it("is typed as an OpenLayers StyleFunction (compile-time) and returns no style for an unknown feature type", () => {
    const fake = fakePlanStore();
    const layer = createRouteLayer(fake.store);
    const fn = layer.getStyleFunction()!;
    const odd = { get: () => "something-else" } as unknown as Feature;
    const out = fn(odd, 1);
    expect(out === undefined || (Array.isArray(out) && out.length === 0)).toBe(true);
  });
});

describe("createRouteLayer: hazard overlay along the route (05 Warning leg, from_m, to_m)", () => {
  it("overlays the stretch between from_m and to_m", () => {
    const fake = fakePlanStore({
      result: resultOf({ legs: [okLeg([[0, 0], [100, 0]])], warnings: [warning({ from_m: 30, to_m: 70 })] }),
    });
    const layer = createRouteLayer(fake.store);
    const hazards = featuresOf(layer, "hazard_segment");
    expect(hazards).toHaveLength(1);
    expect(hazards[0]!.get("severity")).toBe("caution");
    expect(coordsOf(hazards[0]!)).toEqual([
      [30, 0],
      [70, 0],
    ]);
  });

  it("has no duplicate point when the stretch starts or ends on a vertex", () => {
    const fake = fakePlanStore({
      result: resultOf({
        legs: [okLeg([[0, 0], [100, 0], [100, 100]])],
        warnings: [warning({ from_m: 100, to_m: 150 }), warning({ code: "OVER_HARD_SLOPE", severity: "blocked", from_m: 0, to_m: 100 })],
      }),
    });
    const layer = createRouteLayer(fake.store);
    const [a, b] = featuresOf(layer, "hazard_segment");
    expect(coordsOf(a!)).toEqual([
      [100, 0],
      [100, 50],
    ]);
    expect(coordsOf(b!)).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });

  it("skips warnings without a location, on a NO_ROUTE leg, or for a leg that does not exist", () => {
    const fake = fakePlanStore({
      result: resultOf({
        status: "PARTIAL",
        legs: [okLeg([[0, 0], [100, 0]]), noRouteLeg],
        warnings: [
          warning({ leg: null, from_m: null, to_m: null, code: "EVA_DURATION_EXCEEDED", severity: "blocked" }),
          warning({ leg: 1 }),
          warning({ leg: 7 }),
        ],
      }),
    });
    const layer = createRouteLayer(fake.store);
    expect(featuresOf(layer, "hazard_segment")).toHaveLength(0);
  });
});

it("hazard overlay has a shared canvas hatch renderer", () => {
  const { store } = fakePlanStore({ result: resultOf({ legs: [okLeg([[0, 0], [100, 0]])], warnings: [warning()] }) });
  const layer = createRouteLayer(store);
  const feature = featuresOf(layer, "hazard_segment")[0]!;
  expect(stylesOf(layer, feature).some(style => typeof style.getRenderer() === "function")).toBe(true);
  layer.destroy();
});
