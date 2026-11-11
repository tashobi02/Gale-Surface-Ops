/**
 * T24.10 / T24.09 — Full-screen map tests (docs/specs/01 FR-32; 04 §E.5; mockup handoff DV-13, G-42, G-48).
 * The real FullScreenMap component is mounted and its controls are clicked.
 *
 * Not claimed here: pixel geometry (the map taking >= 80 % of the width) and the shared Mars map instance. Those
 * need a browser. The MapControls cases (T07.17) mount the real component and click its buttons.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { FullScreenMap, MAX_SCIENCE_LAYERS, type FullScreenMapLayer } from "../../../src/ui/map/FullScreenMap";
import {
  MAP_CONTROL_PAN_STEP_PX,
  MapControls,
  mapControlHandlers,
  type MapControlsProps,
} from "../../../src/ui/map/MapControls";
import type { MapHandle } from "../../../src/ui/context";
import type { Crew } from "@marswalk/protocol";
import { click, installDom, keyDown, mount as mountRaw, must, removeDom, type Mounted } from "../domHarness";
import { storeFromBeat } from "../fixtureStore";

beforeAll(() => installDom());
afterAll(() => removeDom());

// The map listens on the document for Escape, so a map left mounted by an earlier test would answer a later one's key.
const mounted = new Set<Mounted>();
const mount: typeof mountRaw = async (element) => {
  const view = await mountRaw(element);
  mounted.add(view);
  return { ...view, unmount: async () => { mounted.delete(view); await view.unmount(); } };
};
afterEach(async () => {
  for (const view of [...mounted]) await view.unmount();
  mounted.clear();
  document.body.innerHTML = "";
});

describe("MapControls (04 §E.5, T07.17)", () => {
  const evaProps = (over: Partial<MapControlsProps> = {}): MapControlsProps => ({
    variant: "eva-full",
    onZoom: () => {},
    onFit: () => {},
    follow: true,
    onFollow: () => {},
    layersOpen: false,
    onLayers: () => {},
    onClose: () => {},
    ...over,
  });
  const buttonsOf = (container: HTMLElement): HTMLButtonElement[] => [...container.querySelectorAll<HTMLButtonElement>("button")];
  const controls = (container: HTMLElement): string[] => buttonsOf(container).map((b) => b.dataset.control ?? "");

  it("renders eva-full without throwing: +, −, FIT, FOLLOW, LAYERS and CLOSE, each a labelled button of at least 56 px", async () => {
    const { container } = await mount(createElement(MapControls, evaProps()));
    expect(controls(container)).toEqual(["zoom-in", "zoom-out", "fit", "follow", "layers", "close"]);
    expect(buttonsOf(container).map((b) => b.textContent?.replace(/\s+(ON|OFF)$/, ""))).toEqual(["+", "−", "FIT", "FOLLOW", "LAYERS", "CLOSE"]);
    for (const b of buttonsOf(container)) {
      expect(b.getAttribute("aria-label")).toBeTruthy();
      expect(b.style.minHeight).toBe("56px");
      expect(b.style.minWidth).toBe("56px");
    }
  });

  it("ops and planner show + / − / FIT only, sized for their surface (ops 44 px tablet, planner 32 px mouse)", async () => {
    for (const [variant, px] of [["ops", "44px"], ["planner", "32px"]] as const) {
      const { container, unmount } = await mount(createElement(MapControls, evaProps({ variant })));
      expect(controls(container), variant).toEqual(["zoom-in", "zoom-out", "fit"]);
      for (const b of buttonsOf(container)) expect(b.style.minHeight, variant).toBe(px);
      expect(container.textContent).not.toMatch(/FOLLOW|LAYERS|CLOSE/);
      await unmount();
    }
  });

  it("every action works by button, without drag, wheel or pinch: each click reaches its callback", async () => {
    const onZoom = vi.fn();
    const onFit = vi.fn();
    const onFollow = vi.fn();
    const onLayers = vi.fn();
    const onClose = vi.fn();
    const onPan = vi.fn();
    const { container } = await mount(
      createElement(MapControls, evaProps({ onZoom, onFit, onFollow, onLayers, onClose, onPan, follow: true, layersOpen: false })),
    );
    const press = async (control: string): Promise<void> => click(must(container, `[data-control="${control}"]`));

    for (const control of ["zoom-in", "zoom-out", "fit", "follow", "layers", "close", "pan-north", "pan-south", "pan-west", "pan-east"]) {
      await press(control);
    }
    expect(onZoom.mock.calls).toEqual([[1], [-1]]);
    expect(onFit).toHaveBeenCalledTimes(1);
    expect(onFollow.mock.calls).toEqual([[false]]); // follow was on, so the press turns it off
    expect(onLayers.mock.calls).toEqual([[true]]);
    expect(onClose).toHaveBeenCalledTimes(1);
    // screen directions, y down, as MapHandle.panBy: north is dy -1
    expect(onPan.mock.calls).toEqual([[0, -1], [0, 1], [-1, 0], [1, 0]]);
  });

  it("pan buttons carry a word as well as an arrow, and exist only when onPan is given (04 §A.3 #9)", async () => {
    const without = await mount(createElement(MapControls, evaProps()));
    expect(without.container.querySelector('[data-control^="pan-"]')).toBeNull();
    await without.unmount();

    const { container } = await mount(createElement(MapControls, evaProps({ onPan: () => {} })));
    const words = ["pan-north", "pan-south", "pan-west", "pan-east"].map((c) => must(container, `[data-control="${c}"]`).textContent);
    expect(words).toEqual(["↑NORTH", "↓SOUTH", "←WEST", "→EAST"]);
    for (const c of ["pan-north", "pan-south", "pan-west", "pan-east"]) {
      expect(must(container, `[data-control="${c}"]`).style.minHeight).toBe("56px");
    }
  });

  it("FOLLOW and LAYERS report their state with words and aria, not colour", async () => {
    const view = await mount(createElement(MapControls, evaProps({ follow: false, layersOpen: true })));
    const follow = must<HTMLButtonElement>(view.container, '[data-control="follow"]');
    expect(follow.textContent).toBe("FOLLOW OFF");
    expect(follow.getAttribute("aria-pressed")).toBe("false");
    expect(must(view.container, '[data-control="layers"]').getAttribute("aria-expanded")).toBe("true");
    await view.rerender(createElement(MapControls, evaProps({ follow: true })));
    expect(must(view.container, '[data-control="follow"]').textContent).toBe("FOLLOW ON");
  });

  it("uses neutral chrome tokens and no status colour, whatever the state (04 §A.3)", async () => {
    const { container } = await mount(createElement(MapControls, evaProps({ follow: true, layersOpen: true, onPan: () => {} })));
    for (const b of buttonsOf(container)) {
      const style = b.getAttribute("style") ?? "";
      expect(style).not.toMatch(/--status-|--caution|--warning|--nominal|#[0-9a-fA-F]{3,6}|--color-|--bg-panel|--border-color|--active/);
      expect(style).toMatch(/var\(--(raised)\)/);
      expect(style).toMatch(/var\(--(edge|text-1)\)/);
    }
  });

  it("mapControlHandlers drive the map handle: zoom by one level, pan by the keyboard step in screen pixels, fit the extent", () => {
    const calls: string[] = [];
    const handle = {
      zoomBy: (d: number) => calls.push(`zoom ${d}`),
      panBy: (dx: number, dy: number) => calls.push(`pan ${dx} ${dy}`),
      fitExtent: (e: number[]) => calls.push(`fit ${e.join(",")}`),
    } as unknown as MapHandle;
    const h = mapControlHandlers(handle, { fitExtent: () => [-3000, -3000, 3000, 3000] });
    h.onZoom(1);
    h.onZoom(-1);
    h.onPan(0, -1);
    h.onPan(1, 0);
    h.onFit();
    expect(calls).toEqual(["zoom 1", "zoom -1", `pan 0 ${-MAP_CONTROL_PAN_STEP_PX}`, `pan ${MAP_CONTROL_PAN_STEP_PX} 0`, "fit -3000,-3000,3000,3000"]);
    expect(MAP_CONTROL_PAN_STEP_PX).toBe(50); // the keyboard layer's default step (keyboard.ts)
    mapControlHandlers(handle, { fitExtent: () => [0, 0, 1, 1], panStepPx: 10 }).onPan(-1, 1);
    expect(calls.at(-1)).toBe("pan -10 10");
  });

  it("FullScreenMap mounts the shared MapControls (eva-full) and passes onPan through", async () => {
    const onPan = vi.fn();
    const { container } = await mount(createElement(FullScreenMap, { onPan, onClose: () => {} }));
    const toolbar = must(container, '[data-slot="map-controls"]');
    expect(toolbar.getAttribute("data-variant")).toBe("eva-full");
    await click(must(container, '[data-control="pan-east"]'));
    expect(onPan).toHaveBeenCalledWith(1, 0);
  });
});

describe("FullScreenMap controls (04 §E.5)", () => {
  it("shows +, −, FIT, FOLLOW, LAYERS and CLOSE as labelled buttons, each declaring a 56 px minimum", async () => {
    const { container } = await mount(createElement(FullScreenMap, { onClose: () => {} }));
    const labels = ["+", "−", "FIT", "FOLLOW", "LAYERS", "CLOSE"];
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')];

    expect(buttons.map((b) => b.textContent?.replace(/\s+(ON|OFF)$/, ""))).toEqual(labels);
    for (const b of buttons) {
      expect(b.getAttribute("aria-label")).toBeTruthy();
      expect(b.style.minHeight).toBe("56px");
      expect(b.style.minWidth).toBe("56px");
    }
  });

  it("+, −, FIT and CLOSE call their callbacks exactly once each", async () => {
    const onZoom = vi.fn();
    const onFit = vi.fn();
    const onClose = vi.fn();
    const { container } = await mount(createElement(FullScreenMap, { onZoom, onFit, onClose }));

    await click(must(container, "#map-ctrl-zoom-in"));
    await click(must(container, "#map-ctrl-zoom-out"));
    await click(must(container, "#map-ctrl-fit"));
    await click(must(container, "#map-ctrl-close"));

    expect(onZoom.mock.calls).toEqual([[1], [-1]]);
    expect(onFit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("FOLLOW toggles and reports each change", async () => {
    const onFollow = vi.fn();
    const { container } = await mount(createElement(FullScreenMap, { onFollow, onClose: () => {} }));
    const follow = must<HTMLButtonElement>(container, "#map-ctrl-follow");

    expect(follow.getAttribute("aria-pressed")).toBe("true");
    await click(follow);
    expect(follow.getAttribute("aria-pressed")).toBe("false");
    await click(follow);
    expect(onFollow.mock.calls).toEqual([[false], [true]]);
  });

  it("selection and CLOSE use neutral chrome: no status colour on FOLLOW, layer or CLOSE (04 §A.3)", async () => {
    const { container } = await mount(createElement(FullScreenMap, { onClose: () => {} }));
    await click(must(container, "#map-ctrl-layers"));

    for (const el of container.querySelectorAll<HTMLElement>("button")) {
      expect(el.getAttribute("style") ?? "").not.toMatch(/--status-(nominal|caution|warning)/);
    }
  });
});

describe("FullScreenMap behaviour (04 §E.5)", () => {
  it("a warning closes the full-screen map: rendering with hasWarning calls onClose", async () => {
    const onClose = vi.fn();
    const view = await mount(createElement(FullScreenMap, { hasWarning: false, onClose }));
    expect(onClose).not.toHaveBeenCalled();

    await view.rerender(createElement(FullScreenMap, { hasWarning: true, onClose }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("at most two scientific layers; a third turns the oldest off and says so", async () => {
    expect(MAX_SCIENCE_LAYERS).toBe(2);
    const onLayerToggle = vi.fn<(layers: FullScreenMapLayer[]) => void>();
    const { container } = await mount(
      createElement(FullScreenMap, { layers: ["slope", "thermal_inertia"], onLayerToggle, onClose: () => {} }),
    );
    await click(must(container, "#map-ctrl-layers"));

    const choose = async (name: RegExp) => {
      const button = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => name.test(b.textContent ?? ""));
      if (!button) throw new Error(`no layer button ${name}`);
      await click(button);
    };

    await choose(/Comm shadow/);
    expect(onLayerToggle).toHaveBeenLastCalledWith(["thermal_inertia", "comm_shadow"]);
    const notice = must(container, '[role="status"]');
    expect(notice.textContent).toMatch(/Layer limit \(2\)/);
    expect(notice.textContent).toMatch(/Slope/);
    expect(container.textContent).toMatch(/LAYER: Comm shadow/);
    expect(container.textContent).not.toMatch(/LAYER: Slope/);

    // Turning a layer off clears the notice and reports the shorter list.
    await choose(/Thermal inertia/);
    expect(onLayerToggle).toHaveBeenLastCalledWith(["comm_shadow"]);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("with nothing supplied the readouts are — and labelled; no sample coordinates, minutes or percentages appear", async () => {
    const { container } = await mount(createElement(FullScreenMap, { orientation: "landscape", onClose: () => {} }));
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/2410|1875|14 MIN|71 %|NaN/);
    const centre = must(container, ".value");
    expect(centre.textContent).toContain("X: —");
    expect(centre.getAttribute("data-unavailable")).toBe("true");
    expect(centre.getAttribute("data-provenance")).toBeNull();
    expect(centre.getAttribute("data-source")).toBe("unavailable:map.view");
    const haven = must(container, '[data-slot="haven-compact"] > div');
    const o2 = must(container, '[data-slot="o2-compact"] > div');
    expect(haven.textContent).toContain("—");
    expect(o2.textContent).toContain("—");
    // Flagged unavailable, with the field's own class (05: haven modelled, O₂ simulated), never "assumed", no glyph.
    expect(haven.getAttribute("data-unavailable")).toBe("true");
    expect(haven.getAttribute("data-provenance")).toBe("modelled");
    expect(haven.getAttribute("data-source")).toBe("unavailable:crew.haven.minutes");
    expect(o2.getAttribute("data-provenance")).toBe("simulated");
    expect(haven.textContent).not.toMatch(/[■◆○△▶◇]/);
    expect(o2.textContent).not.toMatch(/[■◆○△▶◇]/);
    expect(container.innerHTML).not.toContain('data-provenance="assumed"');
  });

  it("supplied view and telemetry are shown with their own labels; the view is 'derived', never 'measured'", async () => {
    const { container } = await mount(
      createElement(FullScreenMap, {
        orientation: "landscape",
        view: { center_x_m: 12.5, center_y_m: -3, resolution_m_per_px: 2 },
        haven: { v: 22, unit: "min", prov: "modelled", src: "snapshot:crew.haven.minutes" },
        o2: { v: 64, unit: "%", prov: "simulated", src: "snapshot:crew.o2_frac" },
        onClose: () => {},
      }),
    );

    const centre = must(container, ".value");
    expect(centre.textContent).toContain("X: 12.5 m");
    expect(centre.textContent).toContain("Y: -3.0 m");
    expect(centre.getAttribute("data-provenance")).toBe("derived");
    const haven = must(container, '[data-slot="haven-compact"] > div');
    expect(haven.textContent).toContain("22 MIN");
    expect(haven.getAttribute("data-provenance")).toBe("modelled");
    expect(haven.getAttribute("data-source")).toBe("snapshot:crew.haven.minutes");
    expect(must(container, '[data-slot="o2-compact"] > div').getAttribute("data-provenance")).toBe("simulated");
  });

  it("supplied-but-unusable HAVEN and O₂ (NaN, '', null) read — flagged unavailable, with no glyph and no ordinary source", async () => {
    for (const bad of [Number.NaN, "", "  ", null as unknown as number]) {
      const { container, unmount } = await mount(
        createElement(FullScreenMap, {
          orientation: "landscape",
          haven: { v: bad, unit: "min", prov: "modelled", src: "snapshot:crew.haven.minutes" },
          o2: { v: bad, unit: "%", prov: "simulated", src: "snapshot:crew.o2_frac" },
          onClose: () => {},
        }),
      );
      const haven = must(container, '[data-slot="haven-compact"] > div');
      const o2 = must(container, '[data-slot="o2-compact"] > div');
      for (const [el, path] of [[haven, "crew.haven.minutes"], [o2, "crew.o2_frac"]] as const) {
        expect(el.textContent?.trim()).toBe("—");
        expect(el.getAttribute("data-unavailable")).toBe("true");
        expect(el.getAttribute("data-source")).toBe(`unavailable:${path}`);
        expect(el.textContent).not.toMatch(/[■◆○△▶◇]|MIN|%/);
      }
      await unmount();
    }
  });

  it("a real zero HAVEN or O₂ is still shown", async () => {
    const { container } = await mount(
      createElement(FullScreenMap, {
        orientation: "landscape",
        haven: { v: 0, unit: "min", prov: "modelled", src: "snapshot:crew.haven.minutes" },
        o2: { v: 0, unit: "%", prov: "simulated", src: "snapshot:crew.o2_frac" },
        onClose: () => {},
      }),
    );
    const haven = must(container, '[data-slot="haven-compact"] > div');
    expect(haven.textContent).toContain("0 MIN");
    expect(haven.getAttribute("data-unavailable")).toBeNull();
    expect(must(container, '[data-slot="o2-compact"] > div').textContent).toContain("0 %");
  });

  it("landscape stacks HAVEN above O₂ at the left; portrait has no stack (the cards keep their row)", async () => {
    const landscape = await mount(createElement(FullScreenMap, { orientation: "landscape", onClose: () => {} }));
    const slots = [...landscape.container.querySelectorAll("[data-slot]")].map((el) => el.getAttribute("data-slot"));
    expect(slots.indexOf("landscape-telemetry-stack")).toBeLessThan(slots.indexOf("map-canvas"));
    expect(slots.indexOf("haven-compact")).toBeLessThan(slots.indexOf("o2-compact"));
    await landscape.unmount();

    const portrait = await mount(createElement(FullScreenMap, { orientation: "portrait", onClose: () => {} }));
    expect(portrait.container.querySelector('[data-slot="landscape-telemetry-stack"]')).toBeNull();
  });

  it("landscape HAVEN and O₂ use the specified 40 px / 48 px token, not a local 28 px", async () => {
    const { container } = await mount(createElement(FullScreenMap, { orientation: "landscape", onClose: () => {} }));
    for (const slot of ["haven-compact", "o2-compact"]) {
      const style = must(container, `[data-slot="${slot}"] > div`).getAttribute("style") ?? "";
      expect(style).toContain("--text-value-landscape");
      expect(style).not.toContain("28px");
    }
  });

  it("positions are drawn in working-projection metres (no EPSG:3857, no ol/sphere)", async () => {
    const { container } = await mount(createElement(FullScreenMap, { onClose: () => {} }));
    const html = container.innerHTML;

    expect(html).toMatch(/IAU_2015:49900/);
    expect(html).not.toMatch(/EPSG:3857/);
    expect(html).not.toMatch(/ol\/sphere/);
  });
});

describe("FullScreenMap shows the crew it is given (04 §E.5; map tiles wait on T07.06/T07.17)", () => {
  const ev1: Crew = storeFromBeat("connect").state()!.crew[0]; // x 2410.5, y -1875.0 (fixture `connect`)
  const ev2: Crew = { ...ev1, crew_id: "EV2", x_m: 2430.5, y_m: -1895 };
  const view = { center_x_m: 2400, center_y_m: -1900, resolution_m_per_px: 2 };

  it("lists each crew member with its label and position, every number labelled with the snapshot's class and source", async () => {
    const { container } = await mount(createElement(FullScreenMap, { crew: [ev1, ev2], view, onClose: () => {} }));
    const rows = [...container.querySelectorAll<HTMLElement>('[data-slot="crew-readout"] [data-crew]')];

    expect(rows.map((r) => r.getAttribute("data-crew"))).toEqual(["EV1", "EV2"]);
    expect(rows[0].textContent).toContain("EV1");
    const x = must(rows[0], '[data-field="x_m"]');
    const y = must(rows[0], '[data-field="y_m"]');
    expect(x.textContent).toContain("2410.5");
    expect(y.textContent).toContain("-1875.0");
    expect(x.getAttribute("data-provenance")).toBe("simulated");
    expect(x.getAttribute("data-source")).toBe("snapshot:crew.x_m");
    expect(y.getAttribute("data-source")).toBe("snapshot:crew.y_m");
  });

  it("the class comes from the provenance map when one is given and valid", async () => {
    const { container } = await mount(
      createElement(FullScreenMap, { crew: [ev1], provenance: { "crew.x_m": "replayed", "crew.y_m": "live" as never }, onClose: () => {} }),
    );
    expect(must(container, '[data-field="x_m"]').getAttribute("data-provenance")).toBe("replayed");
    expect(must(container, '[data-field="y_m"]').getAttribute("data-provenance")).toBe("simulated");
  });

  it("with a view each member is marked at its offset from the view centre in pixels (metres / resolution, north up)", async () => {
    const { container } = await mount(createElement(FullScreenMap, { crew: [ev1, ev2], view, onClose: () => {} }));
    const marker = must(container, '[data-slot="crew-marker"][data-crew="EV1"]');

    // (2410.5 - 2400) / 2 = 5.25 px east; (-1875 - -1900) / 2 = 12.5 px north, so -12.5 px on screen.
    expect(marker.style.transform).toBe("translate(5.25px, -12.5px)");
    expect(marker.textContent).toContain("EV1");
    expect(marker.getAttribute("data-provenance")).toBe("simulated");
    expect(must(container, '[data-slot="crew-marker"][data-crew="EV2"]').style.transform).toBe("translate(15.25px, -2.5px)");
  });

  it("without a view the positions are listed but nothing is placed", async () => {
    const { container } = await mount(createElement(FullScreenMap, { crew: [ev1], onClose: () => {} }));
    expect(container.querySelector('[data-slot="crew-marker"]')).toBeNull();
    expect(must(container, '[data-field="x_m"]').textContent).toContain("2410.5");
  });

  it("a position that is not a finite number reads — and is not placed", async () => {
    const { container } = await mount(createElement(FullScreenMap, { crew: [{ ...ev1, x_m: Number.NaN }], view, onClose: () => {} }));
    const x = must(container, '[data-field="x_m"]');

    expect(x.textContent).toContain("—");
    expect(x.getAttribute("data-unavailable")).toBe("true");
    expect(container.querySelector('[data-slot="crew-marker"]')).toBeNull();
    expect(container.textContent).not.toMatch(/NaN/);
  });

  it("with no crew nothing is listed or invented", async () => {
    const { container } = await mount(createElement(FullScreenMap, { view, onClose: () => {} }));
    expect(container.querySelector("[data-crew]")).toBeNull();
    expect(container.textContent).not.toMatch(/EV1|EV2/);
  });
});

describe("FullScreenMap keyboard and focus (04 §E.5, NFR-04)", () => {
  function opener(): HTMLButtonElement {
    const button = document.createElement("button");
    button.id = "opener";
    document.body.appendChild(button);
    button.focus();
    return button;
  }

  it("focus moves into the map when it opens", async () => {
    opener();
    const { container } = await mount(createElement(FullScreenMap, { onClose: () => {} }));
    expect(container.contains(document.activeElement)).toBe(true);
  });

  it("Escape closes the map once and returns focus to the control that opened it", async () => {
    const from = opener();
    const onClose = vi.fn();
    await mount(createElement(FullScreenMap, { onClose }));

    await keyDown(document.activeElement!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(from);
  });

  it("with the layers menu open Escape closes only the menu", async () => {
    opener();
    const onClose = vi.fn();
    const { container } = await mount(createElement(FullScreenMap, { onClose }));
    await click(must(container, "#map-ctrl-layers"));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await keyDown(document.activeElement!, "Escape");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await keyDown(document.activeElement!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("other keys do not close it, and it stops listening once unmounted", async () => {
    opener();
    const onClose = vi.fn();
    const view = await mount(createElement(FullScreenMap, { onClose }));
    await keyDown(document.activeElement!, "Enter");
    await keyDown(document.activeElement!, "a");
    expect(onClose).not.toHaveBeenCalled();

    await view.unmount();
    await keyDown(document.body, "Escape");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("unmounting (the parent closed it) also returns focus to the opener", async () => {
    const from = opener();
    const view = await mount(createElement(FullScreenMap, { onClose: () => {} }));
    await view.unmount();
    expect(document.activeElement).toBe(from);
  });
});
