/**
 * Ops map layers (T25.02; docs/specs/01 FR-30, FR-39, FR-42; 04 §C.1 map overlays, §E.4, §E.5 "max two scientific
 * overlays"; 02 §C.1 projected metres). Originally by Saba Atharique (#187); the review removed the invented walk speed,
 * the circles at [0, 0] and the 1200 m comm radius: coverage and haven bands now come only from the comm grid and the
 * compute time field, and are unavailable without them.
 *
 * The layers are built against the C10 v2 MapHandle with a fake handle (no `createMap`, T07.06). Styles that draw on a
 * canvas (chevron, glyphs, hatch) are `renderer` functions, called here with a recording 2D context.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Feature from "ol/Feature.js";
import MultiLineString from "ol/geom/MultiLineString.js";
import MultiPolygon from "ol/geom/MultiPolygon.js";
import Point from "ol/geom/Point.js";
import LineString from "ol/geom/LineString.js";
import BaseLayer from "ol/layer/Base.js";
import VectorLayer from "ol/layer/Vector.js";
import type VectorSource from "ol/source/Vector.js";
import type Style from "ol/style/Style.js";
import type { Crew, Snapshot, Vehicle } from "@marswalk/protocol";
import {
  COMM_SHADOW_LEGEND,
  HAVEN_BAND_MINUTES,
  OPS_LAYER_Z_INDEX,
  commShadowPolygons,
  createOpsLayers,
  havenContourSegments,
  opsLayerRows,
  type CommGridInput,
  type HavenFieldInput,
} from "../../../src/ui/map/opsLayers";
import { LAYER_Z_INDEX } from "../../../src/ui/context";
import { MAX_SCIENCE_LAYERS } from "../../../src/ui/map/FullScreenMap";
import { fakeMapHandle } from "../fakeMapHandle";
import { installDom, removeDom } from "../domHarness";
import { applyTokens } from "../tokensDom";

let tokens: Record<string, string>;
beforeEach(() => {
  installDom();
  tokens = applyTokens();
});
afterEach(() => removeDom());

const crew = (id: "EV1" | "EV2", x: number, y: number, over: Partial<Crew> = {}): Crew => ({
  crew_id: id,
  x_m: x,
  y_m: y,
  activity: "WALKING",
  stop_index: null,
  o2_frac: 0.71,
  eva_elapsed_s: 120,
  dose_event_ugy: 0,
  dose_event_unsheltered_ugy: 0,
  haven: { minutes: 18, kind: "hab", target_x_m: 0, target_y_m: 0 },
  linked: true,
  link_path: [id, "HAB"],
  stale: false,
  ...over,
});

const vehicle = (id: string, kind: Vehicle["kind"], x: number, y: number, over: Partial<Vehicle> = {}): Vehicle => ({
  vehicle_id: id,
  kind,
  param_set: "pr1-assumed",
  x_m: x,
  y_m: y,
  state: "PARKED",
  task: null,
  path: [],
  eta_s: null,
  battery_wh: null,
  ...over,
});

function snapshot(over: Partial<Snapshot> & { crew?: Crew[]; vehicles?: Vehicle[] } = {}): Snapshot {
  return {
    v: 1,
    type: "SNAPSHOT",
    seq: 1,
    sim_time: "2024-05-20T13:00:00Z",
    session: { session_id: "s-1", scenario_id: "storm-sol4190", data_version: "d", seed: 1, status: "RUNNING", clock: { sim_time: "2024-05-20T13:00:00Z", speed: 1, paused: false }, plan_revision: 1, last_seq: 1, log_hash: "h", hab_candidate_id: null, mission_setup: { crew_count: 2, vehicle_available: true, vehicle_param_set: "pr1-assumed", solar_phase: "max", max_haven_min: 30 }, started_events: [] },
    plan: null,
    crew: [],
    vehicles: [],
    alerts: [],
    options: [],
    tasks: [],
    earth: { light_time_s: 0, next_pass_utc: null, blackout: false, queue: [] },
    clients: [],
    provenance: {},
    conditions: { ltst: null, sun_elevation_deg: null, dose_rate_background_ugy_h: null, dose_rate_event_ugy_h: null, event_series_utc: null, sol: null, source_ids: {}, provenance: {} },
    task_library: [],
    event_library: [],
    next_stop_target: null,
    ...over,
  };
}

const at = (iso: string, over: Parameters<typeof snapshot>[0] = {}): Snapshot => snapshot({ sim_time: iso, ...over });

function setup() {
  const fake = fakeMapHandle();
  const ops = createOpsLayers(fake.handle);
  return { ...fake, ops };
}

const featuresOf = (layer: VectorLayer<VectorSource>): Feature[] => layer.getSource()!.getFeatures();
const byType = (layer: VectorLayer<VectorSource>, type: string): Feature[] => featuresOf(layer).filter((f) => f.get("type") === type);
function stylesOf(layer: VectorLayer<VectorSource>, feature: Feature): Style[] {
  const out = layer.getStyleFunction()!(feature, 1);
  return !out ? [] : Array.isArray(out) ? out : [out];
}

/** OpenLayers draws a style's `renderer` instead of its text, so a marker has one style for each. */
const glyphOf = (styles: Style[]): Style => styles.find((st) => st.getRenderer())!;
const labelOf = (styles: Style[]): string => styles.find((st) => st.getText())!.getText()!.getText() as string;

/** A 2D context that records every call and property write. */
function recordingContext() {
  const calls: { name: string; args: unknown[] }[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get: (_t, name: string) => {
        if (name in props) return props[name];
        return (...args: unknown[]) => {
          calls.push({ name, args });
          return name === "createPattern" ? "PATTERN" : undefined;
        };
      },
      set: (_t, name: string, value) => {
        props[name] = value;
        calls.push({ name: `set ${name}`, args: [value] });
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, props };
}

function draw(style: Style, pixel: number | number[] | number[][] | number[][][]): ReturnType<typeof recordingContext> {
  const rec = recordingContext();
  const renderer = style.getRenderer();
  if (!renderer) throw new Error("style has no renderer");
  renderer(pixel as never, { context: rec.ctx, pixelRatio: 1, resolution: 1, rotation: 0, feature: {} as Feature, geometry: {} as never } as never);
  return rec;
}
const lastSet = (calls: { name: string; args: unknown[] }[], prop: string): unknown => calls.filter((c) => c.name === `set ${prop}`).at(-1)?.args[0];
const dashes = (calls: { name: string; args: unknown[] }[]): unknown[] => calls.filter((c) => c.name === "setLineDash").map((c) => c.args[0]);

describe("createOpsLayers: layers and the map handle (T25.02; FR-02 order)", () => {
  it("adds its six layers to the map through the handle, and removes them on destroy", () => {
    const { host, ops } = setup();
    expect(host.layers).toHaveLength(6);
    for (const layer of [ops.crewLayer, ops.vehicleLayer, ops.commShadowLayer, ops.havenBandsLayer, ops.relayCoverageLayer, ops.havenLinkLayer]) {
      expect(layer).toBeInstanceOf(VectorLayer);
      expect(host.layers).toContain(layer);
    }
    ops.destroy();
    expect(host.layers).toHaveLength(0);
  });

  it("stacks the science overlays between the scientific-overlay and hazards positions, and crew and vehicles above the POIs", () => {
    const { ops } = setup();
    for (const layer of [ops.commShadowLayer, ops.havenBandsLayer]) {
      expect(layer.getZIndex()).toBeGreaterThan(LAYER_Z_INDEX.SCIENTIFIC_OVERLAY);
      expect(layer.getZIndex()).toBeLessThan(LAYER_Z_INDEX.HAZARDS);
    }
    expect(OPS_LAYER_Z_INDEX.vehicles).toBeGreaterThan(LAYER_Z_INDEX.POIS);
    expect(ops.crewLayer.getZIndex()).toBeGreaterThan(LAYER_Z_INDEX.POIS);
    expect(ops.vehicleLayer.getZIndex()).toBeGreaterThan(LAYER_Z_INDEX.POIS);
  });

  it("labels each layer with its provenance class and source id (canvas values cannot carry data-provenance)", () => {
    const { ops } = setup();
    expect(ops.crewLayer.get("provenance")).toBe("simulated");
    expect(ops.crewLayer.get("source_id")).toBe("snapshot:crew");
    expect(ops.vehicleLayer.get("provenance")).toBe("simulated");
    expect(ops.vehicleLayer.get("source_id")).toBe("snapshot:vehicles");
  });
});

describe("crew markers and trails (04 §C.1 crew markers)", () => {
  it("puts a marker at each crew position in projected metres with its id, and clears for no snapshot", () => {
    const { ops } = setup();
    ops.update(snapshot({ crew: [crew("EV1", 2410.5, -1875), crew("EV2", 2350, -1900)] }));
    const markers = byType(ops.crewLayer, "crew_marker");
    expect(markers.map((m) => m.get("crew_id"))).toEqual(["EV1", "EV2"]);
    expect((markers[0]!.getGeometry() as Point).getCoordinates()).toEqual([2410.5, -1875]);
    ops.update(null);
    expect(featuresOf(ops.crewLayer)).toHaveLength(0);
  });

  it("labels the marker with the crew id and draws a solid chevron when linked", () => {
    const { ops } = setup();
    ops.update(snapshot({ crew: [crew("EV1", 0, 0)] }));
    const marker = byType(ops.crewLayer, "crew_marker")[0]!;
    const styles = stylesOf(ops.crewLayer, marker);
    expect(labelOf(styles)).toBe("EV1");
    const { calls } = draw(glyphOf(styles), [50, 50]);
    expect(dashes(calls).every((d) => !d || (d as number[]).length === 0)).toBe(true);
    expect(lastSet(calls, "fillStyle")).toBe(tokens["--text-1"]);
  });

  it("derives the heading from the last move: north is 0, east is a quarter turn clockwise, unknown until it has moved", () => {
    const { ops } = setup();
    ops.update(at("2024-05-20T13:00:00Z", { crew: [crew("EV1", 0, 0)] }));
    expect(byType(ops.crewLayer, "crew_marker")[0]!.get("heading_rad")).toBeNull();
    ops.update(at("2024-05-20T13:00:01Z", { crew: [crew("EV1", 0, 10)] }));
    expect(byType(ops.crewLayer, "crew_marker")[0]!.get("heading_rad")).toBeCloseTo(0, 6);
    ops.update(at("2024-05-20T13:00:02Z", { crew: [crew("EV1", 10, 10)] }));
    expect(byType(ops.crewLayer, "crew_marker")[0]!.get("heading_rad")).toBeCloseTo(Math.PI / 2, 6);
    // Standing still keeps the last heading.
    ops.update(at("2024-05-20T13:00:03Z", { crew: [crew("EV1", 10, 10)] }));
    expect(byType(ops.crewLayer, "crew_marker")[0]!.get("heading_rad")).toBeCloseTo(Math.PI / 2, 6);
  });

  it("draws the trail of the positions seen so far, one line per crew member", () => {
    const { ops } = setup();
    ops.update(at("2024-05-20T13:00:00Z", { crew: [crew("EV1", 0, 0)] }));
    expect(byType(ops.crewLayer, "crew_trail")).toHaveLength(0);
    ops.update(at("2024-05-20T13:00:01Z", { crew: [crew("EV1", 0, 10)] }));
    ops.update(at("2024-05-20T13:00:02Z", { crew: [crew("EV1", 5, 20)] }));
    const trail = byType(ops.crewLayer, "crew_trail");
    expect(trail).toHaveLength(1);
    expect((trail[0]!.getGeometry() as LineString).getCoordinates()).toEqual([
      [0, 0],
      [0, 10],
      [5, 20],
    ]);
  });

  it("starts a new trail for a new session", () => {
    const { ops } = setup();
    ops.update(at("2024-05-20T13:00:00Z", { crew: [crew("EV1", 0, 0)] }));
    ops.update(at("2024-05-20T13:00:01Z", { crew: [crew("EV1", 0, 10)] }));
    const other = at("2024-05-20T13:00:02Z", { crew: [crew("EV1", 99, 99)] });
    other.session = { ...other.session, session_id: "s-2" };
    ops.update(other);
    expect(byType(ops.crewLayer, "crew_trail")).toHaveLength(0);
  });
});

describe("'me' and 'buddy' are told apart (plan step 2 of docs/plan/frontend/17-eva-tablet.md)", () => {
  it("marks the crew member this view belongs to as own, and the others as not", () => {
    const { ops } = setup();
    ops.setOwnCrew("EV1");
    ops.update(snapshot({ crew: [crew("EV1", 0, 0), crew("EV2", 10, 0)] }));
    const markers = byType(ops.crewLayer, "crew_marker");
    expect(markers[0]!.get("own")).toBe(true);
    expect(markers[1]!.get("own")).toBe(false);
  });

  it("draws a ring around the own marker and none around the buddy, so the two differ by shape and not by colour", () => {
    const { ops } = setup();
    ops.setOwnCrew("EV1");
    ops.update(snapshot({ crew: [crew("EV1", 0, 0), crew("EV2", 10, 0)] }));
    const markers = byType(ops.crewLayer, "crew_marker");
    const ownStyles = stylesOf(ops.crewLayer, markers[0]!);
    const buddyStyles = stylesOf(ops.crewLayer, markers[1]!);
    // The own marker has a second renderer (the ring); the buddy has only the chevron.
    expect(ownStyles.filter((st) => st.getRenderer()).length).toBe(2);
    expect(buddyStyles.filter((st) => st.getRenderer()).length).toBe(1);
    const { calls } = draw(ownStyles.find((st) => st.getRenderer() && st !== glyphOf(ownStyles))!, [50, 50]);
    expect(calls.some((c) => c.name === "arc")).toBe(true);
  });

  it("with no own crew every marker is a buddy, and setting the own crew redraws the markers", () => {
    const { ops } = setup();
    ops.update(snapshot({ crew: [crew("EV1", 0, 0), crew("EV2", 10, 0)] }));
    expect(byType(ops.crewLayer, "crew_marker").every((m) => m.get("own") === false)).toBe(true);
    ops.setOwnCrew("EV2");
    const markers = byType(ops.crewLayer, "crew_marker");
    expect(markers[0]!.get("own")).toBe(false);
    expect(markers[1]!.get("own")).toBe(true);
  });
});

describe("stale crew (04 §C.1: dashed outline and 'STALE 0:42'; §D.5)", () => {
  it("draws an unlinked crew member with a dashed outline in grey and a STALE label with the age since the link was lost", () => {
    const { ops } = setup();
    ops.update(at("2024-05-20T13:00:00Z", { crew: [crew("EV1", 0, 0)] }));
    ops.update(at("2024-05-20T13:00:10Z", { crew: [crew("EV1", 0, 0, { linked: false, stale: true })] }));
    ops.update(at("2024-05-20T13:00:52Z", { crew: [crew("EV1", 0, 0, { linked: false, stale: true })] }));
    const marker = byType(ops.crewLayer, "crew_marker")[0]!;
    const styles = stylesOf(ops.crewLayer, marker);
    expect(labelOf(styles)).toBe("EV1\nSTALE 0:42");
    const { calls } = draw(glyphOf(styles), [50, 50]);
    expect(dashes(calls).some((d) => Array.isArray(d) && d.length > 0)).toBe(true);
    expect(lastSet(calls, "fillStyle")).toBe(tokens["--text-3"]);
  });

  it("says STALE without an age when the crew member was already unlinked on first sight, never a made-up age", () => {
    const { ops } = setup();
    ops.update(at("2024-05-20T13:00:00Z", { crew: [crew("EV2", 0, 0, { linked: false, stale: true })] }));
    expect(labelOf(stylesOf(ops.crewLayer, byType(ops.crewLayer, "crew_marker")[0]!))).toBe("EV2\nSTALE —");
  });

  it("drops the STALE label when the link returns", () => {
    const { ops } = setup();
    ops.update(at("2024-05-20T13:00:00Z", { crew: [crew("EV1", 0, 0, { linked: false, stale: true })] }));
    ops.update(at("2024-05-20T13:00:05Z", { crew: [crew("EV1", 0, 0)] }));
    expect(labelOf(stylesOf(ops.crewLayer, byType(ops.crewLayer, "crew_marker")[0]!))).toBe("EV1");
  });
});

describe("vehicles and the hab (04 §C.1 vehicles, hab)", () => {
  it("marks each vehicle at its position, pressurized filled and utility outlined, with its id", () => {
    const { ops } = setup();
    ops.update(snapshot({ vehicles: [vehicle("PR1", "pressurized_rover", -1800, -1500), vehicle("UR1", "utility_rover", 100, 200)] }));
    const markers = byType(ops.vehicleLayer, "vehicle_marker");
    expect(markers.map((m) => m.get("vehicle_id"))).toEqual(["PR1", "UR1"]);
    expect((markers[0]!.getGeometry() as Point).getCoordinates()).toEqual([-1800, -1500]);
    const pr = stylesOf(ops.vehicleLayer, markers[0]!);
    const ur = stylesOf(ops.vehicleLayer, markers[1]!);
    expect(labelOf(pr)).toBe("PR1");
    expect(labelOf(ur)).toBe("UR1");
    const prDraw = draw(glyphOf(pr), [10, 10]);
    const urDraw = draw(glyphOf(ur), [10, 10]);
    expect(lastSet(prDraw.calls, "fillStyle")).toBe(tokens["--text-1"]);
    expect(lastSet(urDraw.calls, "fillStyle")).toBe(tokens["--void"]);
  });

  it("draws a dispatched path as a dashed text-1 line and the target as a reticle", () => {
    const { ops } = setup();
    const moving = vehicle("PR1", "pressurized_rover", 0, 0, {
      state: "EN_ROUTE",
      task: { kind: "SUMMON", target: { x_m: 500, y_m: 400 } },
      path: [
        [0, 0],
        [250, 200],
        [500, 400],
      ],
    });
    ops.update(snapshot({ vehicles: [moving] }));
    const path = byType(ops.vehicleLayer, "vehicle_path")[0]!;
    expect((path.getGeometry() as LineString).getCoordinates()).toHaveLength(3);
    const stroke = stylesOf(ops.vehicleLayer, path)[0]!.getStroke()!;
    expect(stroke.getColor()).toBe(tokens["--text-1"]);
    expect(stroke.getLineDash()!.length).toBeGreaterThan(0);
    const reticle = byType(ops.vehicleLayer, "vehicle_target")[0]!;
    expect((reticle.getGeometry() as Point).getCoordinates()).toEqual([500, 400]);
    const { calls } = draw(stylesOf(ops.vehicleLayer, reticle)[0]!, [30, 30]);
    expect(calls.some((c) => c.name === "arc")).toBe(true);
  });

  it("has no path or reticle for a parked vehicle, and marks the hab only when its position is given", () => {
    const { ops } = setup();
    ops.update(snapshot({ vehicles: [vehicle("PR1", "pressurized_rover", 0, 0)] }));
    expect(byType(ops.vehicleLayer, "vehicle_path")).toHaveLength(0);
    expect(byType(ops.vehicleLayer, "vehicle_target")).toHaveLength(0);
    expect(byType(ops.vehicleLayer, "hab")).toHaveLength(0);
    ops.setHab({ x_m: -1800, y_m: -1500 });
    ops.update(snapshot({ vehicles: [] }));
    const hab = byType(ops.vehicleLayer, "hab")[0]!;
    expect((hab.getGeometry() as Point).getCoordinates()).toEqual([-1800, -1500]);
    expect(labelOf(stylesOf(ops.vehicleLayer, hab))).toBe("HAB");
  });
});

describe("no invented science: coverage and haven bands come only from data (04 §A.3 #8; AGENTS rule 2)", () => {
  it("draws no coverage and no haven band from a snapshot alone, and reports both unavailable", () => {
    const { ops } = setup();
    ops.update(snapshot({ crew: [crew("EV1", 0, 0)] }));
    expect(featuresOf(ops.commShadowLayer)).toHaveLength(0);
    expect(featuresOf(ops.havenBandsLayer)).toHaveLength(0);
    expect(ops.availability()).toEqual({ comm_shadow: false, haven_bands: false, relay_coverage: [] });
  });

  it("uses the 10, 20 and 30 minute bands of 04 §C.1 and no other", () => {
    expect([...HAVEN_BAND_MINUTES]).toEqual([10, 20, 30]);
  });

  it("states the comm shadow legend of 04 §C.1", () => {
    expect(COMM_SHADOW_LEGEND).toBe("NO SIGNAL — line of sight only");
  });
});

describe("comm shadow from the comm grid (FR-42; 05 RoutingGrid comm_hab_asset)", () => {
  // 4 x 3 grid, 10 m cells, top-left corner (100, 200). 1 = line of sight, 0 = none, 255 = no data.
  const grid = (values: number[]): CommGridInput => ({
    cell_m: 10,
    width: 4,
    height: 3,
    origin_m: [100, 200],
    values: Uint8Array.from(values),
    source_id: "grid-comm-hab",
  });
  const VALUES = [1, 0, 0, 1, 1, 0, 0, 255, 0, 1, 1, 1];

  it("merges the cells with no line of sight into rectangles in projected metres, leaving LOS and no-data cells out", () => {
    const polygons = commShadowPolygons(grid(VALUES));
    const sorted = polygons.map((p) => p[0]!.map((c) => c.join(",")).join(" ")).sort();
    expect(sorted).toEqual([
      "100,180 110,180 110,170 100,170 100,180",
      "110,200 130,200 130,180 110,180 110,200",
    ]);
  });

  it("is empty when every cell has line of sight, and rejects a grid whose size does not match", () => {
    expect(commShadowPolygons(grid(new Array(12).fill(1)))).toEqual([]);
    expect(() => commShadowPolygons(grid([0, 1]))).toThrow(/12/);
  });

  it("fills the coverage layer, labels it derived with the grid's source id, and clears it again", () => {
    const { ops } = setup();
    ops.setCommGrid(grid(VALUES));
    const shadow = featuresOf(ops.commShadowLayer);
    expect(shadow).toHaveLength(1);
    expect(shadow[0]!.getGeometry()).toBeInstanceOf(MultiPolygon);
    expect(ops.commShadowLayer.get("provenance")).toBe("derived");
    expect(ops.commShadowLayer.get("source_id")).toBe("grid-comm-hab");
    expect(ops.availability().comm_shadow).toBe(true);
    ops.setCommGrid(null);
    expect(featuresOf(ops.commShadowLayer)).toHaveLength(0);
    expect(ops.availability().comm_shadow).toBe(false);
  });

  it("draws the hatch in text-3 with a dotted outline (04 §C.1), solid at the comm-shadow opacity when no pattern can be made", () => {
    const { ops } = setup();
    ops.setCommGrid(grid(VALUES));
    const feature = featuresOf(ops.commShadowLayer)[0]!;
    const [style] = stylesOf(ops.commShadowLayer, feature);
    const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const { calls } = draw(style!, [[ring], [ring]] as never);
    expect(dashes(calls).some((d) => Array.isArray(d) && d.length > 0)).toBe(true);
    expect(lastSet(calls, "strokeStyle")).toBe(tokens["--text-3"]);
    expect(calls.filter((c) => c.name === "fill").length).toBeGreaterThan(0);
  });
});

describe("haven bands from the compute time field (04 §C.1 haven isochrones; 02 §D.8)", () => {
  // A 9 x 9 field of 10 m cells whose time grows with the distance from the centre cell at 1 s per metre.
  const field = (over: Partial<HavenFieldInput> = {}): HavenFieldInput => {
    const n = 9;
    const seconds = new Float64Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) seconds[r * n + c] = Math.hypot(r - 4, c - 4) * 10;
    return { cell_m: 10, width: n, height: n, origin_m: [0, 90], seconds, source_id: "haven-field-test", ...over };
  };

  it("finds the contour where the field crosses the level, within one cell", () => {
    const segments = havenContourSegments(field(), 30);
    expect(segments.length).toBeGreaterThan(8);
    for (const [[x1, y1], [x2, y2]] of segments) {
      for (const [x, y] of [[x1, y1], [x2, y2]] as [number, number][]) {
        // centre cell (4, 4) is at (45, 45); level 30 s at 1 s per m is 30 m away
        expect(Math.abs(Math.hypot(x - 45, y - 45) - 30)).toBeLessThan(10);
      }
    }
  });

  it("finds no contour when the level is above every cell or below the start", () => {
    expect(havenContourSegments(field(), 10_000)).toEqual([]);
    expect(havenContourSegments(field(), -1)).toEqual([]);
  });

  it("treats unreachable cells (Infinity) as outside the band", () => {
    const f = field();
    f.seconds[0] = Infinity;
    expect(() => havenContourSegments(f, 30)).not.toThrow();
  });

  it("rejects a field whose size does not match", () => {
    expect(() => havenContourSegments(field({ width: 5 }), 30)).toThrow(/81|45/);
  });

  it("draws one contour per band with a label, as thin text-2 lines, and labels the layer modelled with the field's source", () => {
    const { ops } = setup();
    // A field reaching 36 s only, to keep the 10/20/30 minute levels testable: 600, 1200 and 1800 s.
    const big = field();
    for (let i = 0; i < big.seconds.length; i++) big.seconds[i] = big.seconds[i]! * 60;
    ops.setHavenField(big);
    const lines = byType(ops.havenBandsLayer, "haven_band");
    expect(lines.map((l) => l.get("minutes")).sort((a, b) => a - b)).toEqual([10, 20, 30]);
    expect(lines[0]!.getGeometry()).toBeInstanceOf(MultiLineString);
    const stroke = stylesOf(ops.havenBandsLayer, lines[0]!)[0]!.getStroke()!;
    expect(stroke.getColor()).toBe(tokens["--text-2"]);
    expect(stroke.getWidth()).toBeLessThanOrEqual(1.5);
    const labels = byType(ops.havenBandsLayer, "haven_label");
    expect(labels.map((l) => stylesOf(ops.havenBandsLayer, l)[0]!.getText()!.getText()).sort()).toEqual(["10 min", "20 min", "30 min"]);
    expect(ops.havenBandsLayer.get("provenance")).toBe("modelled");
    expect(ops.havenBandsLayer.get("source_id")).toBe("haven-field-test");
    expect(ops.availability().haven_bands).toBe(true);
    ops.setHavenField(null);
    expect(featuresOf(ops.havenBandsLayer)).toHaveLength(0);
    expect(ops.availability().haven_bands).toBe(false);
  });

  it("draws no label for a band the field does not reach", () => {
    const { ops } = setup();
    ops.setHavenField(field());
    // the test field reaches about 56 s, far below 10 min
    expect(featuresOf(ops.havenBandsLayer)).toHaveLength(0);
  });
});

describe("scientific layer toggles: max two, the oldest is turned off and reported (04 §E.5)", () => {
  it("starts with the comm shadow and the haven bands on, and the limit is the one FullScreenMap uses", () => {
    const { ops } = setup();
    expect(MAX_SCIENCE_LAYERS).toBe(2);
    expect(ops.getVisibleLayers()).toEqual(["comm_shadow", "haven_bands"]);
    expect(ops.commShadowLayer.getVisible()).toBe(true);
    expect(ops.havenBandsLayer.getVisible()).toBe(true);
  });

  it("turns the oldest off when a third is turned on, changes the real layer visibility and says which one", () => {
    const { ops } = setup();
    const slope = new BaseLayer({ visible: false });
    ops.bindLayer("slope", slope);
    const result = ops.toggleLayer("slope", true);
    expect(result).toEqual({ visible: ["haven_bands", "slope"], turnedOff: "comm_shadow" });
    expect(ops.commShadowLayer.getVisible()).toBe(false);
    expect(ops.havenBandsLayer.getVisible()).toBe(true);
    expect(slope.getVisible()).toBe(true);
    expect(ops.getVisibleLayers()).toEqual(["haven_bands", "slope"]);
  });

  it("turns a layer off on request and ignores a repeat", () => {
    const { ops } = setup();
    expect(ops.toggleLayer("haven_bands", false)).toEqual({ visible: ["comm_shadow"], turnedOff: null });
    expect(ops.havenBandsLayer.getVisible()).toBe(false);
    expect(ops.toggleLayer("haven_bands", false)).toEqual({ visible: ["comm_shadow"], turnedOff: null });
    expect(ops.toggleLayer("comm_shadow", true)).toEqual({ visible: ["comm_shadow"], turnedOff: null });
  });

  it("applies the recorded visibility when a slope or thermal-inertia layer is bound later", () => {
    const { ops } = setup();
    ops.toggleLayer("haven_bands", false);
    ops.toggleLayer("thermal_inertia", true);
    const ti = new BaseLayer({ visible: false });
    ops.bindLayer("thermal_inertia", ti);
    expect(ti.getVisible()).toBe(true);
    const slope = new BaseLayer({ visible: true });
    ops.bindLayer("slope", slope);
    expect(slope.getVisible()).toBe(false);
  });

  it("never lets the crew and vehicle layers be switched off by a toggle", () => {
    const { ops } = setup();
    for (const id of ["slope", "thermal_inertia", "comm_shadow", "haven_bands"] as const) ops.toggleLayer(id, true);
    expect(ops.crewLayer.getVisible()).toBe(true);
    expect(ops.vehicleLayer.getVisible()).toBe(true);
  });
});

describe("colours are tokens (04 §C.1)", () => {
  it("follows a changed token when the chevron is drawn", () => {
    const { ops } = setup();
    ops.update(snapshot({ crew: [crew("EV1", 0, 0)] }));
    document.documentElement.style.setProperty("--text-1", "#0A0B0C");
    const styles = stylesOf(ops.crewLayer, byType(ops.crewLayer, "crew_marker")[0]!);
    expect(lastSet(draw(glyphOf(styles), [5, 5]).calls, "fillStyle")).toBe("#0A0B0C");
  });
});

describe("package 21: relay coverage, haven per crew, caution hatch, last-linked time (FR-39, FR-42; FD-071, FD-072)", () => {
  // 3 x 2 grid of 10 m cells at (0, 20): 1 = line of sight from the relay, 0 = none.
  const relayGrid = (values: number[] = [1, 1, 0, 0, 1, 255]): CommGridInput => ({
    cell_m: 10,
    width: 3,
    height: 2,
    origin_m: [0, 20],
    values: Uint8Array.from(values),
    source_id: "api:relay-coverage/UR1",
  });

  it("relay coverage row says not computed without grid", () => {
    const { ops } = setup();
    const row = ops.rows().find((r) => r.id === "relay_coverage")!;
    expect(row.text).toBe("Relay coverage — not computed");
    expect(row.unavailable).toBe(true);
    expect(row.prov).toBe("derived");
    expect(row.src).toBe("unavailable:relay_coverage");
    // Before any map exists the rows read the same, from the pure function.
    expect(opsLayerRows(null).find((r) => r.id === "relay_coverage")!.text).toBe("Relay coverage — not computed");
  });

  it("draws the line-of-sight cells of a relay grid in projected metres, labels them derived with the endpoint source, and clears", () => {
    const { ops } = setup();
    ops.setRelayCoverage("UR1", relayGrid());
    const cells = byType(ops.relayCoverageLayer, "relay_coverage");
    expect(cells).toHaveLength(1);
    const rings = (cells[0]!.getGeometry() as MultiPolygon).getCoordinates().map((p) => p[0]!.map((c) => c.join(",")).join(" ")).sort();
    expect(rings).toEqual(["0,20 20,20 20,10 0,10 0,20", "10,10 20,10 20,0 10,0 10,10"]);
    expect(ops.relayCoverageLayer.get("provenance")).toBe("derived");
    expect(ops.relayCoverageLayer.get("source_id")).toBe("api:relay-coverage/UR1");
    expect(ops.availability().relay_coverage).toEqual(["UR1"]);
    const row = ops.rows().find((r) => r.id === "relay_coverage")!;
    expect(row).toMatchObject({ text: "Relay coverage — UR1", unavailable: false, src: "api:relay-coverage/UR1" });
    ops.setRelayCoverage("UR1", null);
    expect(featuresOf(ops.relayCoverageLayer)).toHaveLength(0);
    expect(ops.rows().find((r) => r.id === "relay_coverage")!.unavailable).toBe(true);
  });

  it("switches relay coverage with the comm shadow toggle (one coverage overlay, 04 §E.5)", () => {
    const { ops } = setup();
    ops.toggleLayer("comm_shadow", false);
    expect(ops.relayCoverageLayer.getVisible()).toBe(false);
    ops.toggleLayer("comm_shadow", true);
    expect(ops.relayCoverageLayer.getVisible()).toBe(true);
  });

  it("draws each crew member's haven from Crew.haven: a line to the haven and its minutes, modelled (N-28)", () => {
    const { ops } = setup();
    ops.update(snapshot({ crew: [crew("EV1", 100, 50, { haven: { minutes: 18, kind: "vehicle", target_x_m: 300, target_y_m: 40 } })] }));
    const link = byType(ops.havenLinkLayer, "haven_link")[0]!;
    expect((link.getGeometry() as LineString).getCoordinates()).toEqual([[100, 50], [300, 40]]);
    expect(ops.havenLinkLayer.get("provenance")).toBe("modelled");
    expect(ops.havenLinkLayer.get("source_id")).toBe("snapshot:crew.haven");
    const label = byType(ops.havenLinkLayer, "haven_link_label")[0]!;
    expect(stylesOf(ops.havenLinkLayer, label)[0]!.getText()!.getText()).toBe("EV1 HAVEN 18 MIN · VEHICLE");
    const stroke = stylesOf(ops.havenLinkLayer, link)[0]!.getStroke()!;
    expect(stroke.getColor()).toBe(tokens["--text-2"]);
  });

  it("marks a haven beyond the session's haven rule with the caution colour, shape and word", () => {
    const { ops } = setup();
    // mission_setup.max_haven_min is 30 in the fixture snapshot.
    ops.update(snapshot({ crew: [crew("EV1", 0, 0, { haven: { minutes: 34, kind: "hab", target_x_m: 0, target_y_m: 900 } })] }));
    const label = byType(ops.havenLinkLayer, "haven_link_label")[0]!;
    expect(stylesOf(ops.havenLinkLayer, label)[0]!.getText()!.getText()).toBe("EV1 HAVEN 34 MIN · HAB ▲ CAUTION");
    const link = byType(ops.havenLinkLayer, "haven_link")[0]!;
    const stroke = stylesOf(ops.havenLinkLayer, link)[0]!.getStroke()!;
    expect(stroke.getColor()).toBe(tokens["--caution"]);
    expect(stroke.getLineDash()!.length).toBeGreaterThan(0);
  });

  it("hatches the area of the time field beyond the haven rule with the shared caution pattern (FD-072)", () => {
    const { ops } = setup();
    // 3 x 1 field of 10 m cells: 10, 25 and 40 minutes from the hab.
    const field: HavenFieldInput = { cell_m: 10, width: 3, height: 1, origin_m: [0, 10], seconds: Float64Array.from([600, 1500, 2400]), source_id: "haven-field-test" };
    ops.setHavenField(field);
    expect(byType(ops.havenBandsLayer, "haven_caution")).toHaveLength(0);
    ops.setHavenRule(20);
    const hatch = byType(ops.havenBandsLayer, "haven_caution");
    expect(hatch).toHaveLength(1);
    expect((hatch[0]!.getGeometry() as MultiPolygon).getCoordinates()[0]![0]!.map((c) => c.join(",")).join(" ")).toBe("10,10 30,10 30,0 10,0 10,10");
    const style = stylesOf(ops.havenBandsLayer, hatch[0]!)[0]!;
    const ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const { calls } = draw(style, [[ring]] as never);
    // The hatch tile needs a 2D canvas, which the test DOM has not: the fill then falls back to the caution tint.
    expect(calls.some((c) => c.name === "fill")).toBe(true);
    expect(String(lastSet(calls, "fillStyle"))).not.toBe("");
    expect(lastSet(calls, "strokeStyle")).toBe(tokens["--caution"]);
    ops.setHavenRule(null);
    expect(byType(ops.havenBandsLayer, "haven_caution")).toHaveLength(0);
  });

  it("counts the STALE age from the Hab Core's last-linked sim time when it is given, even on first sight (FD-072, N-03)", () => {
    const { ops } = setup();
    ops.update(at("2024-05-20T13:00:52Z", { crew: [crew("EV1", 0, 0, { linked: false, stale: true, last_linked_sim_time: "2024-05-20T13:00:10Z" })] }));
    expect(labelOf(stylesOf(ops.crewLayer, byType(ops.crewLayer, "crew_marker")[0]!))).toBe("EV1\nSTALE 0:42");
    ops.update(at("2024-05-20T13:00:53Z", { crew: [crew("EV1", 0, 0, { linked: false, stale: true, last_linked_sim_time: null })] }));
    expect(labelOf(stylesOf(ops.crewLayer, byType(ops.crewLayer, "crew_marker")[0]!))).toBe("EV1\nSTALE —");
  });

  it("keeps absent snapshot counts unavailable instead of inventing zero crew, vehicles or havens", () => {
    const { ops } = setup();
    const counts = () => ops.rows().filter(row => ["crew", "vehicles", "haven_links"].includes(row.id));
    const expectMissing = () => {
      for (const row of counts()) {
        expect(row.text).toBe(`${row.id === "crew" ? "Crew" : row.id === "vehicles" ? "Vehicles" : "Haven per crew"} — —`);
        expect(row.unavailable).toBe(true);
        expect(row.src).toMatch(/^unavailable:/);
      }
    };
    try {
      expectMissing();
      ops.update(snapshot());
      for (const row of counts()) {
        expect(row.text).toMatch(/ — 0$/);
        expect(row.unavailable).toBe(false);
        expect(row.src).toMatch(/^snapshot:/);
      }
      ops.update(null);
      expectMissing();
    } finally { ops.destroy(); }
  });

  it("lists one row per layer, each with a provenance class and a source id", () => {
    const { ops } = setup();
    ops.update(snapshot({ crew: [crew("EV1", 0, 0)], vehicles: [vehicle("UR1", "utility_rover", 1, 1)] }));
    const rows = ops.rows();
    expect(rows.map((r) => r.id)).toEqual(["crew", "vehicles", "comm_shadow", "relay_coverage", "haven_bands", "haven_links"]);
    for (const row of rows) {
      expect(["measured", "derived", "modelled", "assumed", "replayed", "simulated"]).toContain(row.prov);
      expect(row.src.length).toBeGreaterThan(0);
    }
    expect(rows.find((r) => r.id === "comm_shadow")!.text).toBe("Comm shadow — not computed");
    expect(rows.find((r) => r.id === "haven_links")!).toMatchObject({ text: "Haven per crew — 1", prov: "modelled", unavailable: false });
  });
});
