/**
 * T07.13 — ?debug=1 diagnostics overlay (NFR-11, 02 §F, 05 §E.1; C10 v2 `DebugOverlay` component).
 * The real component is mounted; the map and the worker client are small fakes that record subscriptions.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import type { PlanResultMessage, SampleResult, WorkerResponse } from "@marswalk/protocol";
import { DebugOverlay, computeGridCell, isDebugParamEnabled, type GridMetadata } from "../../src/ui/debug";
import type { AppContext, MapHandle, WorkerClient } from "../../src/ui/context";
import { installDom, mount, must, removeDom, type Mounted, flush } from "./domHarness";
import { mockLoadedSite } from "./map/mapFixtures";
import { act } from "react";

const SITE = mockLoadedSite();
const GRID: GridMetadata = SITE.site.grid; // cell 100 m, origin (-3000, 3000), 60 x 60

beforeAll(() => installDom());
afterAll(() => removeDom());

interface Fakes {
  ctx: AppContext;
  mapListeners: Map<string, Set<(e: { coordinate: number[] }) => void>>;
  workerListeners: Set<(m: WorkerResponse) => void>;
  emitWorker: (m: WorkerResponse) => void;
  pointer: (x: number, y: number) => Promise<void>;
}

function fakes(debug: boolean, withMap = true): Fakes {
  const mapListeners = new Map<string, Set<(e: { coordinate: number[] }) => void>>();
  const map = {
    on(type: string, fn: (e: { coordinate: number[] }) => void) {
      if (!mapListeners.has(type)) mapListeners.set(type, new Set());
      mapListeners.get(type)!.add(fn);
      return { type, fn };
    },
    un(type: string, fn: (e: { coordinate: number[] }) => void) {
      mapListeners.get(type)?.delete(fn);
    },
  };
  const workerListeners = new Set<(m: WorkerResponse) => void>();
  const workerClient = {
    onMessage: (fn: (m: WorkerResponse) => void) => {
      workerListeners.add(fn);
      return () => workerListeners.delete(fn);
    },
  } as unknown as WorkerClient;
  const mapHandle = { getMap: () => map } as unknown as MapHandle;
  const ctx: AppContext = {
    site: SITE,
    planStore: {} as never,
    workerClient,
    mapHandle: withMap ? mapHandle : undefined,
    debug,
  };
  return {
    ctx,
    mapListeners,
    workerListeners,
    emitWorker: (m) => workerListeners.forEach((fn) => fn(m)),
    pointer: async (x, y) => {
      await act(async () => {
        mapListeners.get("pointermove")?.forEach((fn) => fn({ coordinate: [x, y] }));
      });
    },
  };
}

const mounted: Mounted[] = [];
async function show(f: Fakes): Promise<HTMLElement> {
  const view = await mount(createElement(DebugOverlay, { ctx: f.ctx }));
  mounted.push(view);
  return view.container;
}
afterEach(async () => {
  for (const view of mounted.splice(0)) await view.unmount();
  vi.unstubAllGlobals();
});

const row = (c: HTMLElement, name: string): HTMLElement => must(c, `[data-debug="${name}"]`);

describe("DebugOverlay off (NFR-11: without ?debug=1 nothing changes)", () => {
  it("renders nothing and registers no map listener, worker listener or animation frame", async () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", raf);
    const f = fakes(false);
    const container = await show(f);
    expect(container.innerHTML).toBe("");
    expect([...f.mapListeners.values()].every((s) => s.size === 0)).toBe(true);
    expect(f.workerListeners.size).toBe(0);
    expect(raf).not.toHaveBeenCalled();
  });
});

describe("DebugOverlay on", () => {
  it("shows the data version from the manifest and — for everything not yet measured", async () => {
    const container = await show(fakes(true));
    expect(row(container, "data-version").textContent).toContain(SITE.site.data_version);
    for (const name of ["fps", "worker", "cell"]) {
      const el = row(container, name);
      expect(el.textContent, name).toContain("—");
      expect(el.getAttribute("data-unavailable"), name).toBe("true");
    }
    expect(row(container, "data-version").hasAttribute("data-unavailable")).toBe(false);
  });

  it("every value carries data-provenance and data-source", async () => {
    const container = await show(fakes(true));
    for (const name of ["fps", "worker", "cell", "data-version"]) {
      const el = row(container, name);
      expect(el.getAttribute("data-provenance"), name).toMatch(/^(measured|derived)$/);
      expect(el.getAttribute("data-source"), name).toBeTruthy();
    }
  });

  it("measures FPS from animation frames: — until a full second has passed, then frames per second", async () => {
    const frames: ((t: number) => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const container = await show(fakes(true));
    const step = async (t: number): Promise<void> => {
      const cb = frames.shift()!;
      await act(async () => cb(t));
    };
    await step(1000); // first frame starts the window
    for (let t = 1100; t < 2000; t += 100) await step(t); // 9 frames inside the first second
    expect(row(container, "fps").textContent).toContain("—");
    await step(2000); // 10 frames in 1000 ms
    expect(row(container, "fps").textContent).toContain("10");
    expect(row(container, "fps").hasAttribute("data-unavailable")).toBe(false);
  });

  it("shows timing_ms of the latest PLAN_RESULT and ignores other worker messages", async () => {
    const f = fakes(true);
    const container = await show(f);
    await act(async () => f.emitWorker({ type: "SAMPLE_RESULT" } as SampleResult));
    expect(row(container, "worker").textContent).toContain("—");

    await act(async () => f.emitWorker({ type: "PLAN_RESULT", timing_ms: { total: 12.34 } } as unknown as PlanResultMessage));
    expect(row(container, "worker").textContent).toContain("total 12.3 ms");
    expect(row(container, "worker").hasAttribute("data-unavailable")).toBe(false);

    await act(async () => f.emitWorker({ type: "PLAN_RESULT", timing_ms: { total: 7 } } as unknown as PlanResultMessage));
    expect(row(container, "worker").textContent).toContain("total 7.0 ms");
  });

  it("shows the grid cell [i, j] under the pointer by the 05 §E.1 formula on the manifest grid, or 'outside grid'", async () => {
    const f = fakes(true);
    const container = await show(f);
    await f.pointer(-2950, 2950);
    expect(row(container, "cell").textContent).toContain("[0, 0]");
    await f.pointer(0, 0);
    expect(row(container, "cell").textContent).toContain("[30, 30]");
    await f.pointer(-5000, 5000);
    expect(row(container, "cell").textContent).toContain("outside grid");
    expect(row(container, "cell").hasAttribute("data-unavailable")).toBe(false);
  });

  it("works without a map handle (cell stays —)", async () => {
    const container = await show(fakes(true, false));
    expect(row(container, "cell").textContent).toContain("—");
  });

  it("removes its listeners and cancels its animation frame on unmount", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", () => 42);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const f = fakes(true);
    const view = await mount(createElement(DebugOverlay, { ctx: f.ctx }));
    expect(f.mapListeners.get("pointermove")?.size).toBe(1);
    expect(f.workerListeners.size).toBe(1);
    await view.unmount();
    expect(f.mapListeners.get("pointermove")?.size).toBe(0);
    expect(f.workerListeners.size).toBe(0);
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it("is hidden in print with a real @media print rule, not an invalid inline declaration", async () => {
    const container = await show(fakes(true));
    const overlay = must(container, "[data-testid='debug-overlay']");
    expect(overlay.getAttribute("style")).not.toContain("@media");
    expect(container.querySelector("style")).toBeNull();
    const css = readFileSync(resolve(import.meta.dirname, "../../src/ui/debug.css"), "utf8");
    expect(css).toMatch(/@media print\s*\{[^}]*\[data-testid=["']?debug-overlay["']?\][^}]*display:\s*none\s*!important/);
  });

  it("uses design tokens and at least 12 px text (04 §C.2)", async () => {
    const container = await show(fakes(true));
    const style = must(container, "[data-testid='debug-overlay']").getAttribute("style") ?? "";
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,6}|rgba?\(|--color-/);
    expect(style).toContain("var(--text-micro)");
    expect(style).toContain("var(--text-1)");
    expect(style).toContain("var(--panel)");
  });

  it("builds its DOM with React text nodes, never innerHTML", () => {
    const source = readFileSync(resolve(__dirname, "../../src/ui/debug.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML/);
  });
});

describe("helpers", () => {
  it("computeGridCell: i = floor((origin_y − y)/cell), j = floor((x − origin_x)/cell); null outside", () => {
    expect(computeGridCell(-3000, 3000, GRID)).toEqual({ i: 0, j: 0 });
    expect(computeGridCell(-2900, 2900, GRID)).toEqual({ i: 1, j: 1 });
    expect(computeGridCell(2999.9, -2999.9, GRID)).toEqual({ i: 59, j: 59 });
    expect(computeGridCell(3000, 0, GRID)).toBeNull();
    expect(computeGridCell(-5000, 5000, GRID)).toBeNull();
  });

  it("isDebugParamEnabled reads ?debug=1 only", () => {
    expect(isDebugParamEnabled("?debug=1")).toBe(true);
    expect(isDebugParamEnabled("?debug=0")).toBe(false);
    expect(isDebugParamEnabled("?debug=true")).toBe(false);
    expect(isDebugParamEnabled("")).toBe(false);
    expect(isDebugParamEnabled("?site=mock_site&debug=1")).toBe(true);
  });
});
