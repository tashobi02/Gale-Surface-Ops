/**
 * T07.12 — point inspector popover (FR-03, FR-15, NFR-05, 02 §D.1, 02 §E.2, 03 §D, 04 §A.3, §E).
 * The worker client and the map are small fakes; the DOM is real (jsdom).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Layer, SamplePointRequest, SampleResult } from "@marswalk/protocol";
import { initPointInspector, type PointInspector } from "../../src/ui/map/inspector";
import type { AppContext, LoadedSite, MapHandle, MapView } from "../../src/ui/context";
import { installDom, removeDom } from "./domHarness";
import { loadedSiteFrom, mockLoadedSite, mockManifest } from "./map/mapFixtures";

beforeAll(() => installDom());
afterAll(() => removeDom());

const INSIDE: SampleResult = {
  type: "SAMPLE_RESULT",
  request_id: "r",
  inside_aoi: true,
  passable: true,
  reason: null,
  lat: -4.6945123,
  lon_e: 137.3869456,
  elevation_m: -2450.3,
  slope_p90_deg: 8.4,
  ti_tiu: 345,
  flags: [],
  snap: { x_m: 410, y_m: 325, distance_m: 2.1 },
};
const OUTSIDE: SampleResult = { ...INSIDE, inside_aoi: false, passable: false, reason: "OUTSIDE_AOI", lat: null, lon_e: null, elevation_m: null, slope_p90_deg: null, ti_tiu: null, snap: null };

/** The mock manifest plus a thermal-inertia layer (the mock site has none). */
function siteWithTi(): LoadedSite {
  const manifest = mockManifest();
  const base = manifest.layers[0];
  manifest.layers = [
    ...manifest.layers,
    { ...base, layer_id: "ti", title: "Thermal inertia", category: "thermal", provenance: "measured", source_ids: ["simonsen-2024-rad"], asset_id: "tiles-elevation", units: "tiu" } as Layer,
  ];
  return loadedSiteFrom(manifest);
}

interface Rig {
  inspector: PointInspector;
  ctx: AppContext;
  samples: SamplePointRequest[];
  /** Answer the oldest request not yet answered / the request at `index` (0 = first sent). */
  resolveNext: (r: SampleResult) => void;
  rejectNext: (e: Error) => void;
  resolveAt: (index: number, r: SampleResult) => void;
  rejectAt: (index: number, e: Error) => void;
  click: (x: number, y: number) => void;
  viewChange: () => void;
  mapListeners: Map<string, Set<(e: { coordinate: number[] }) => void>>;
  viewListeners: Set<(v: MapView) => void>;
  target: HTMLElement;
}
const rigs: Rig[] = [];
afterEach(() => {
  rigs.splice(0).forEach((r) => r.inspector.destroy());
  document.body.innerHTML = "";
});

function rig(opts: { site?: LoadedSite; reply?: (req: SamplePointRequest) => Promise<SampleResult>; shouldInspect?: (c: [number, number]) => boolean } = {}): Rig {
  const target = document.createElement("div");
  target.tabIndex = 0;
  document.body.appendChild(target);
  const mapListeners = new Map<string, Set<(e: { coordinate: number[] }) => void>>();
  const map = {
    on: (type: string, fn: (e: { coordinate: number[] }) => void) => {
      if (!mapListeners.has(type)) mapListeners.set(type, new Set());
      mapListeners.get(type)!.add(fn);
    },
    un: (type: string, fn: (e: { coordinate: number[] }) => void) => mapListeners.get(type)?.delete(fn),
    getPixelFromCoordinate: (c: number[]) => [300 + c[0] / 10, 200 - c[1] / 10],
    getSize: () => [800, 600],
  };
  const viewListeners = new Set<(v: MapView) => void>();
  const mapHandle = {
    getMap: () => map,
    getTargetElement: () => target,
    getResolution: () => 10,
    onViewChange: (fn: (v: MapView) => void) => {
      viewListeners.add(fn);
      return () => viewListeners.delete(fn);
    },
  } as unknown as MapHandle;

  const samples: SamplePointRequest[] = [];
  const resolvers: ((r: SampleResult) => void)[] = [];
  const rejecters: ((e: Error) => void)[] = [];
  let answered = 0;
  const samplePoint = vi.fn((req: Omit<SamplePointRequest, "type">) => {
    samples.push({ type: "SAMPLE_POINT", ...req });
    if (opts.reply) return opts.reply({ type: "SAMPLE_POINT", ...req });
    return new Promise<SampleResult>((resolve, reject) => {
      resolvers.push(resolve);
      rejecters.push(reject);
    });
  });
  const ctx = {
    site: opts.site ?? mockLoadedSite(),
    planStore: { get: () => ({ scenario: { hard_slope_limit_deg: 12 } }) },
    workerClient: { samplePoint },
    mapHandle,
    debug: false,
  } as unknown as AppContext;

  const inspector = initPointInspector(mapHandle, ctx, { shouldInspect: opts.shouldInspect });
  const made: Rig = {
    inspector,
    ctx,
    samples,
    resolveNext: (r) => resolvers[answered++]?.(r),
    rejectNext: (e) => rejecters[answered++]?.(e),
    resolveAt: (index, r) => resolvers[index]?.(r),
    rejectAt: (index, e) => rejecters[index]?.(e),
    click: (x, y) => mapListeners.get("singleclick")?.forEach((fn) => fn({ coordinate: [x, y] })),
    viewChange: () => viewListeners.forEach((fn) => fn({ center_x_m: 0, center_y_m: 0, resolution_m_per_px: 10 })),
    mapListeners,
    viewListeners,
    target,
  };
  rigs.push(made);
  return made;
}

const popover = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-testid='inspector-popover']");
const field = (name: string): HTMLElement => document.querySelector<HTMLElement>(`[data-field='${name}']`)!;

describe("the request (02 §D.2, §E.2)", () => {
  it("a map click sends SAMPLE_POINT with the snap radius 50 and the scenario's hard slope limit", async () => {
    const r = rig();
    r.click(410, 325);
    expect(r.samples).toHaveLength(1);
    expect(r.samples[0]).toMatchObject({ type: "SAMPLE_POINT", x_m: 410, y_m: 325, snap_radius_m: 50, hard_slope_limit_deg: 12 });
    expect(typeof r.samples[0].request_id).toBe("string");
  });

  it("inspectAt(x, y) is the keyboard crosshair entry point and sends the same request", async () => {
    const r = rig();
    void r.inspector.inspectAt(-100, 250);
    expect(r.samples[0]).toMatchObject({ x_m: -100, y_m: 250, snap_radius_m: 50 });
  });

  it("each request has its own id, and two inspectors never share one (no module-level counter)", () => {
    const a = rig();
    const b = rig();
    void a.inspector.inspectAt(0, 0);
    void a.inspector.inspectAt(1, 1);
    void b.inspector.inspectAt(0, 0);
    const ids = [...a.samples, ...b.samples].map((s) => s.request_id);
    expect(new Set(ids).size).toBe(3);
  });

  it("shouldInspect lets the page skip a click (add-stop mode, a POI hit)", () => {
    const r = rig({ shouldInspect: () => false });
    r.click(1, 1);
    expect(r.samples).toHaveLength(0);
  });
});

describe("what the popover shows (FR-03, FR-15, NFR-05)", () => {
  it("shows lat/lon to 5 decimals, elevation, slope and TI, each with the provenance and source of its manifest layer", async () => {
    const site = siteWithTi();
    const r = rig({ site });
    const done = r.inspector.inspectAt(410, 325);
    r.resolveNext(INSIDE);
    await done;

    expect(field("position").textContent).toContain("−4.69451°, 137.38695°E");
    expect(field("elevation").textContent).toContain("2450.3 m");
    expect(field("slope").textContent).toContain("8.4°");
    expect(field("ti").textContent).toContain("345 tiu");

    const layer = (id: string) => site.layers.get(id)!;
    const expectLabel = (name: string, layerId: string) => {
      expect(field(name).getAttribute("data-provenance"), name).toBe(layer(layerId).provenance);
      expect(field(name).getAttribute("data-source"), name).toBe(layer(layerId).source_ids[0]);
      expect(field(name).hasAttribute("data-unavailable"), name).toBe(false);
    };
    expectLabel("elevation", "elevation");
    expectLabel("slope", "slope");
    expectLabel("ti", "ti");
    expectLabel("position", "elevation"); // the DEM's frame gives the position its class
    // never a stand-in source id
    expect(popover()!.outerHTML).not.toContain("themis-ti-100m");
    expect(document.querySelectorAll("[data-source]").length).toBeGreaterThanOrEqual(4);
  });

  it("a value whose manifest layer is missing is not shown: it reads — flagged unavailable (the mock site has no TI layer)", async () => {
    const r = rig(); // mock site: no ti layer
    const done = r.inspector.inspectAt(410, 325);
    r.resolveNext(INSIDE);
    await done;
    expect(field("ti").textContent).toContain("—");
    expect(field("ti").textContent).not.toContain("345");
    expect(field("ti").getAttribute("data-unavailable")).toBe("true");
    expect(field("ti").getAttribute("data-source")).toMatch(/^unavailable:/);
  });

  it("TI with no coverage reads 'no data'; a null elevation or slope reads —, flagged unavailable, keeping the layer's class", async () => {
    const site = siteWithTi();
    const r = rig({ site });
    const done = r.inspector.inspectAt(0, 0);
    r.resolveNext({ ...INSIDE, ti_tiu: null, elevation_m: null, slope_p90_deg: null });
    await done;
    expect(field("ti").textContent).toContain("no data");
    expect(field("ti").getAttribute("data-unavailable")).toBe("true");
    expect(field("elevation").textContent).toContain("—");
    expect(field("elevation").getAttribute("data-unavailable")).toBe("true");
    expect(field("elevation").getAttribute("data-provenance")).toBe(site.layers.get("elevation")!.provenance);
    expect(field("slope").textContent).toContain("—");
  });

  it("outside the AOI: 'Outside mapped area' and no values at all", async () => {
    const r = rig({ site: siteWithTi() });
    const done = r.inspector.inspectAt(9000, 9000);
    r.resolveNext(OUTSIDE);
    await done;
    expect(popover()!.textContent).toContain("Outside mapped area");
    expect(document.querySelectorAll("[data-field]")).toHaveLength(0);
    expect(popover()!.textContent).not.toMatch(/\d/);
  });

  it("status uses colour only for status, with icon and word: a hard hazard is BLOCKED with its shape", async () => {
    const r = rig();
    const done = r.inspector.inspectAt(0, 0);
    r.resolveNext({ ...INSIDE, passable: false, reason: "HARD_HAZARD" });
    await done;
    const status = popover()!.querySelector<HTMLElement>("[data-field='passable'] .status-indicator")!;
    expect(status.classList.contains("status-warning")).toBe(true);
    expect(status.querySelector(".status-glyph svg polygon")).not.toBeNull(); // the drawn octagon (FD-208)
    expect(status.textContent).toContain("BLOCKED");
    expect(popover()!.querySelector("[data-field='passable']")!.textContent).toMatch(/hard hazard/i);
  });

  it("no data at the point is UNKNOWN (shape and word), a passable point shows no status block", async () => {
    const r = rig();
    let done = r.inspector.inspectAt(0, 0);
    r.resolveNext({ ...INSIDE, passable: false, reason: "NO_DATA" });
    await done;
    expect(popover()!.querySelector("[data-field='passable'] .status-unknown")!.textContent).toContain("UNKNOWN");
    done = r.inspector.inspectAt(1, 1);
    r.resolveNext(INSIDE);
    await done;
    expect(popover()!.querySelector("[data-field='passable']")).toBeNull();
  });

  it("the header is neutral chrome: no caution or status colour, tokens only, 12 px minimum", async () => {
    const r = rig();
    const done = r.inspector.inspectAt(0, 0);
    r.resolveNext(INSIDE);
    await done;
    const root = popover()!;
    const header = root.querySelector<HTMLElement>("[data-part='header']")!;
    expect(header.getAttribute("style") ?? "").not.toMatch(/--caution|--warning|--status|--accent|--color-/);
    const style = root.getAttribute("style") ?? "";
    expect(style).toContain("var(--panel)");
    expect(style).toContain("var(--text-1)");
    expect(style).toContain("var(--text-micro)");
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,6}|rgba?\(|box-shadow|border-radius/);
  });

  it("builds its DOM from text nodes: values containing markup are shown as text, and the module has no innerHTML", () => {
    const source = readFileSync(resolve(__dirname, "../../src/ui/map/inspector.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|themis-ti-100m|color-fg|--color-/);
  });
});

describe("position, focus and dismissal (04 §E)", () => {
  it("is placed beside the clicked point, clamped inside the map", async () => {
    const r = rig();
    let done = r.inspector.inspectAt(0, 0); // pixel (300, 200)
    r.resolveNext(INSIDE);
    await done;
    expect(popover()!.style.left).toBe("312px");
    expect(popover()!.style.top).toBe("212px");
    done = r.inspector.inspectAt(4000, -4000); // pixel (700, 600): near the right and bottom edges
    r.resolveNext(INSIDE);
    await done;
    const left = parseFloat(popover()!.style.left);
    const top = parseFloat(popover()!.style.top);
    expect(left).toBeLessThan(700);
    expect(top).toBeLessThan(600);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it("moves focus into the dialog when it opens, and back to the map when it closes", async () => {
    const r = rig();
    r.target.focus();
    const done = r.inspector.inspectAt(0, 0);
    r.resolveNext(INSIDE);
    await done;
    const root = popover()!;
    expect(root.getAttribute("role")).toBe("dialog");
    expect(root.contains(document.activeElement)).toBe(true);
    r.inspector.close();
    expect(document.activeElement).toBe(r.target);
  });

  it("closes on Escape and the document keydown listener lives only while it is open", async () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const r = rig();
    expect(add.mock.calls.filter(([t]) => t === "keydown")).toHaveLength(0);
    const done = r.inspector.inspectAt(0, 0);
    r.resolveNext(INSIDE);
    await done;
    expect(add.mock.calls.filter(([t]) => t === "keydown")).toHaveLength(1);
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(popover()).toBeNull();
    expect(r.inspector.isOpen()).toBe(false);
    expect(remove.mock.calls.filter(([t]) => t === "keydown")).toHaveLength(1);
    add.mockRestore();
    remove.mockRestore();
  });

  it("the CLOSE button (a word, not just a glyph) closes it", async () => {
    const r = rig();
    const done = r.inspector.inspectAt(0, 0);
    r.resolveNext(INSIDE);
    await done;
    const close = popover()!.querySelector<HTMLButtonElement>("button")!;
    expect(close.textContent).toBe("CLOSE");
    close.click();
    expect(popover()).toBeNull();
  });

  it("dismisses when the map moves (pan or zoom)", async () => {
    const r = rig();
    const done = r.inspector.inspectAt(0, 0);
    r.resolveNext(INSIDE);
    await done;
    expect(r.inspector.isOpen()).toBe(true);
    r.viewChange();
    expect(popover()).toBeNull();
    expect(r.inspector.isOpen()).toBe(false);
  });
});

describe("stale responses and failures (FR-16)", () => {
  it("shows the latest click only: an older response that arrives late is discarded", async () => {
    const r = rig();
    const first = r.inspector.inspectAt(10, 10);
    const second = r.inspector.inspectAt(20, 20);
    r.resolveNext({ ...INSIDE, elevation_m: -111 }); // answers the first
    r.resolveNext({ ...INSIDE, elevation_m: -222 }); // answers the second
    await Promise.all([first, second]);
    expect(field("elevation").textContent).toContain("222");
    expect(document.querySelectorAll("[data-testid='inspector-popover']")).toHaveLength(1);
  });

  it("the older response arriving after the newer one does not overwrite it", async () => {
    const r = rig();
    const first = r.inspector.inspectAt(10, 10);
    const second = r.inspector.inspectAt(20, 20);
    r.resolveAt(1, { ...INSIDE, elevation_m: -222 }); // the newer answers first
    await second;
    expect(field("elevation").textContent).toContain("222");
    r.resolveAt(0, { ...INSIDE, elevation_m: -111 }); // the older arrives late
    await first;
    expect(field("elevation").textContent).toContain("222");
    expect(field("elevation").textContent).not.toContain("111");
  });

  it("a response that arrives after the popover was closed does not reopen it", async () => {
    const r = rig();
    const pending = r.inspector.inspectAt(0, 0);
    r.inspector.close();
    r.resolveNext(INSIDE);
    await pending;
    expect(popover()).toBeNull();
    expect(r.inspector.isOpen()).toBe(false);
  });

  it("a response after destroy is discarded and nothing is left behind", async () => {
    const r = rig();
    const pending = r.inspector.inspectAt(0, 0);
    r.inspector.destroy();
    r.resolveNext(INSIDE);
    await pending;
    expect(popover()).toBeNull();
  });

  it("a rejected sample shows UNKNOWN with a message, does not throw, and the next click works", async () => {
    const r = rig();
    const failing = r.inspector.inspectAt(0, 0);
    r.rejectNext(new Error("worker crashed"));
    await expect(failing).resolves.toBeUndefined();
    const root = popover()!;
    expect(root.textContent).toContain("UNKNOWN");
    expect(root.textContent).toMatch(/could not read this point/i);
    expect(root.querySelector(".status-unknown")).not.toBeNull();

    const next = r.inspector.inspectAt(5, 5);
    r.resolveNext(INSIDE);
    await next;
    expect(field("elevation")).not.toBeNull();
  });

  it("a stale rejection is discarded too", async () => {
    const r = rig();
    const first = r.inspector.inspectAt(1, 1);
    const second = r.inspector.inspectAt(2, 2);
    r.resolveAt(1, INSIDE);
    await second;
    r.rejectAt(0, new Error("SUPERSEDED")); // the older one fails late
    await first;
    expect(popover()!.textContent).not.toMatch(/could not read/i);
    expect(field("elevation")).not.toBeNull();
  });
});

describe("destroy", () => {
  it("removes the map and view listeners, the popover and the key handler", async () => {
    const r = rig();
    expect(r.mapListeners.get("singleclick")!.size).toBe(1);
    expect(r.viewListeners.size).toBe(1);
    const done = r.inspector.inspectAt(0, 0);
    r.resolveNext(INSIDE);
    await done;
    r.inspector.destroy();
    expect(r.mapListeners.get("singleclick")!.size).toBe(0);
    expect(r.viewListeners.size).toBe(0);
    expect(popover()).toBeNull();
    const before = r.samples.length;
    r.click(1, 1);
    expect(r.samples.length).toBe(before);
    expect(() => r.inspector.destroy()).not.toThrow();
  });
});

