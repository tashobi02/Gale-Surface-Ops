/**
 * T07.09 — SCR-03 layers panel (03 SCR-03; 04 §D "two scientific overlays at once"; FR-02, FR-15, FR-16, FR-17, FR-18; FD-111).
 * The real LayersPanel is mounted and clicked. Layer controllers are not involved: the panel works on row descriptions
 * and reports changes through callbacks, so the same panel serves any site.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { LayersPanel, isScientificOverlay, type PanelLayer } from "../../src/ui/screens/scr03LayersPanel";
import { click, installDom, mount as mountRaw, must, removeDom, type Mounted } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());

const open: Mounted[] = [];
afterEach(async () => {
  for (const m of open.splice(0)) await m.unmount();
  document.body.innerHTML = "";
});

const row = (id: string, over: Partial<PanelLayer> = {}): PanelLayer => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  scientific: false,
  visible: false,
  opacity: 1,
  status: "ready",
  provenance: "derived",
  sourceIds: ["usgs-gale-dem-1m-v3"],
  nativeResolutionM: 1,
  legend: { type: "none" },
  ...over,
});
const sci = (id: string, over: Partial<PanelLayer> = {}): PanelLayer => row(id, { scientific: true, ...over });
const LAYERS: PanelLayer[] = [row("ortho", { visible: true }), sci("slope"), sci("elevation"), sci("ti"), row("traverse", { visible: true })];

async function panel(layers: PanelLayer[] = LAYERS) {
  const onVisibleChange = vi.fn();
  const onOpacityChange = vi.fn();
  const m = await mountRaw(createElement(LayersPanel, { layers, onVisibleChange, onOpacityChange }));
  open.push(m);
  const switchOf = (id: string): HTMLButtonElement => must<HTMLButtonElement>(m.container, `[data-layer-id="${id}"] [role="switch"]`);
  return { root: m.container, onVisibleChange, onOpacityChange, switchOf };
}

describe("LayersPanel rows (03 SCR-03)", () => {
  it("every row has a switch, its name, a provenance chip with a source id and an info link", async () => {
    const { root, switchOf } = await panel();
    for (const l of LAYERS) {
      const r = must(root, `[data-layer-id="${l.id}"]`);
      expect(switchOf(l.id).getAttribute("aria-checked")).toBe(String(l.visible));
      expect(must(r, '[data-slot="layer-name"]').textContent).toBe(l.title);
      const chip = must(r, '[data-slot="layer-provenance"]');
      expect(chip.getAttribute("data-provenance")).toBe("derived");
      expect(chip.getAttribute("data-source")).toBe("usgs-gale-dem-1m-v3");
    }
  });

  it("a layer whose class is not known shows the dash on its chip, flagged unavailable, not a guessed class", async () => {
    const { root } = await panel([row("traverse", { provenance: null, sourceIds: [] })]);
    const chip = must(root, '[data-layer-id="traverse"] [data-slot="layer-provenance"]');
    expect(chip.textContent).toBe("—");
    expect(chip.getAttribute("data-unavailable")).toBe("true");
    expect(chip.hasAttribute("data-provenance")).toBe(false);
  });

  it("info link anchors: each row links to its own anchor in SCR-09, #/sources#layer-<id>", async () => {
    const { root } = await panel();
    for (const l of LAYERS) {
      expect(must<HTMLAnchorElement>(root, `[data-layer-id="${l.id}"] [data-slot="layer-info"]`).getAttribute("href")).toBe(`#/sources#layer-${l.id}`);
    }
  });

  it("toggling a switch reports it once and flips it", async () => {
    const { switchOf, onVisibleChange } = await panel();
    await click(switchOf("slope"));
    expect(onVisibleChange).toHaveBeenCalledWith("slope", true);
    expect(switchOf("slope").getAttribute("aria-checked")).toBe("true");
    await click(switchOf("slope"));
    expect(onVisibleChange).toHaveBeenLastCalledWith("slope", false);
  });

  it("the opacity slider has a name and reports a fraction; a row with no opacity has none", async () => {
    const layers = [sci("slope", { visible: true }), row("pois", { opacity: null })];
    const { root, onOpacityChange } = await panel(layers);
    const slider = must<HTMLInputElement>(root, '[data-layer-id="slope"] input[type="range"]');
    expect(slider.getAttribute("aria-label")).toBe("Slope opacity");
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    set.call(slider, "40");
    const { act } = await import("react");
    await act(async () => {
      slider.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    expect(onOpacityChange).toHaveBeenCalledWith("slope", 0.4);
    expect(root.querySelector('[data-layer-id="pois"] input[type="range"]')).toBeNull();
  });

  it("the legend of a classes layer shows the class words over the scenario's edges, each number labelled and sourced", async () => {
    const layers = [
      sci("slope", {
        visible: true,
        legend: {
          type: "classes",
          items: [
            { key: "caution", label: "caution", fromDeg: 10, toDeg: 15 },
            { key: "over_limit", label: "over limit", fromDeg: 15, toDeg: null },
          ],
          edgeSources: { caution: "scenario.caution_slope_deg", hard: "scenario.hard_slope_limit_deg" },
        },
      }),
    ];
    const { root } = await panel(layers);
    const legend = must(root, '[data-layer-id="slope"] [data-slot="layer-legend"]');
    expect(legend.textContent).toMatch(/caution/);
    expect(legend.textContent).toMatch(/over limit/);
    for (const el of legend.querySelectorAll('[data-slot="legend-edge"]')) {
      expect(el.closest("[data-provenance][data-source]") ?? el.querySelector("[data-provenance][data-source]")).not.toBeNull();
    }
    expect(legend.querySelector('[data-source="scenario.hard_slope_limit_deg"]')).not.toBeNull();
  });

  it("no unlabelled number in the whole panel: every digit sits inside an element with data-provenance and data-source", async () => {
    const layers = [
      sci("slope", { visible: true, nativeResolutionM: 1, legend: { type: "classes", items: [{ key: "caution", label: "caution", fromDeg: 10, toDeg: 15 }, { key: "over_limit", label: "over limit", fromDeg: 15, toDeg: null }], edgeSources: { caution: "scenario.caution_slope_deg", hard: "scenario.hard_slope_limit_deg" } } }),
      sci("ti", { visible: true, legend: { type: "ramp", stops: [[50, "low"], [800, "high"]] } }),
    ];
    const { root } = await panel(layers);
    const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
    const bad: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      if (/\d/.test(text) && !n.parentElement!.closest("[data-provenance][data-source], [data-identifier]")) bad.push(text);
    }
    expect(bad).toEqual([]);
  });
});

describe("LayersPanel two scientific overlays at most (04 §D; FD-111)", () => {
  it("scientific overlays are elevation, slope, thermal inertia, spectral, comm shadow and haven bands; ortho, hillshade, traverse, POIs, hazards and route are not", () => {
    const layer = (layer_id: string, category: string) => ({ layer_id, category }) as Parameters<typeof isScientificOverlay>[0];
    for (const [id, cat] of [["elevation", "topographic"], ["slope", "topographic"], ["ti", "thermal"], ["spectral", "spectral"], ["comm_shadow", "hazard"], ["haven_bands", "hazard"]]) {
      expect(isScientificOverlay(layer(id, cat)), id).toBe(true);
    }
    for (const [id, cat] of [["ortho", "optical"], ["hillshade", "topographic"], ["traverse", "mission"], ["pois", "mission"], ["hazards", "hazard"], ["route", "mission"]]) {
      expect(isScientificOverlay(layer(id, cat)), id).toBe(false);
    }
  });

  it("third overlay turns off the oldest and says so", async () => {
    const { switchOf, onVisibleChange, root } = await panel();
    await click(switchOf("slope"));
    await click(switchOf("elevation"));
    expect(root.querySelector('[data-slot="overlay-notice"]')).toBeNull();
    await click(switchOf("ti"));
    expect(switchOf("slope").getAttribute("aria-checked"), "the oldest is off").toBe("false");
    expect(switchOf("elevation").getAttribute("aria-checked")).toBe("true");
    expect(switchOf("ti").getAttribute("aria-checked")).toBe("true");
    expect(onVisibleChange).toHaveBeenCalledWith("slope", false);
    const notice = must(root, '[data-slot="overlay-notice"]');
    expect(notice.closest('[role="status"]'), "announced through a status region").not.toBeNull();
    expect(notice.textContent).toMatch(/Slope turned off/);
    expect(notice.textContent).toMatch(/two scientific overlays/);
  });

  it("the ortho basemap and the traverse never count: turning them on with two overlays showing drops nothing", async () => {
    const { switchOf, onVisibleChange, root } = await panel();
    await click(switchOf("slope"));
    await click(switchOf("elevation"));
    await click(switchOf("ortho")); // off
    await click(switchOf("ortho")); // on
    await click(switchOf("traverse"));
    expect(onVisibleChange).not.toHaveBeenCalledWith("slope", false);
    expect(root.querySelector('[data-slot="overlay-notice"]')).toBeNull();
  });

  it("the oldest is by the order they were turned on, and a layer turned off and on again is the newest", async () => {
    const { switchOf } = await panel();
    await click(switchOf("slope"));
    await click(switchOf("elevation"));
    await click(switchOf("slope")); // off
    await click(switchOf("slope")); // on again: now newer than elevation
    await click(switchOf("ti"));
    expect(switchOf("elevation").getAttribute("aria-checked")).toBe("false");
    expect(switchOf("slope").getAttribute("aria-checked")).toBe("true");
  });

  it("overlays already on at the start count: a third switched on drops the earliest of them", async () => {
    const { switchOf } = await panel([sci("slope", { visible: true }), sci("elevation", { visible: true }), sci("ti")]);
    await click(switchOf("ti"));
    expect(switchOf("slope").getAttribute("aria-checked")).toBe("false");
  });
});

describe("LayersPanel states (03 SCR-03: Default, Loading, Unavailable, Out of range)", () => {
  it("unavailable row disabled with reason: the switch cannot be turned on and the reason is in words", async () => {
    const layers = [sci("ti", { status: "unavailable", unavailableReason: 'Tile set "tiles-ti" is not in this site bundle' }), sci("slope")];
    const { root, switchOf, onVisibleChange } = await panel(layers);
    const r = must(root, '[data-layer-id="ti"]');
    expect(r.getAttribute("data-state")).toBe("unavailable");
    expect(switchOf("ti").disabled).toBe(true);
    expect(must(r, '[data-slot="layer-reason"]').textContent).toContain("Unavailable");
    expect(must(r, '[data-slot="layer-reason"]').textContent).toContain('Tile set "tiles-ti" is not in this site bundle');
    await click(switchOf("ti"));
    expect(onVisibleChange).not.toHaveBeenCalled();
    expect(switchOf("slope").disabled, "the other rows are unaffected").toBe(false);
  });

  it("an unavailable layer that was on is shown off", async () => {
    const { switchOf } = await panel([sci("ti", { visible: true, status: "unavailable", unavailableReason: "r" })]);
    expect(switchOf("ti").getAttribute("aria-checked")).toBe("false");
  });

  it("loading shows a placeholder and the word, with the row still usable", async () => {
    const { root, switchOf } = await panel([sci("slope", { visible: true, status: "loading" })]);
    const r = must(root, '[data-layer-id="slope"]');
    expect(r.getAttribute("data-state")).toBe("loading");
    expect(must(r, '[data-slot="layer-loading"]').textContent).toMatch(/Loading/);
    expect(switchOf("slope").disabled).toBe(false);
  });

  it("out of range tells the user to zoom in and gives the native resolution as a labelled number", async () => {
    const { root } = await panel([sci("ti", { visible: true, status: "out_of_range", nativeResolutionM: 100 })]);
    const r = must(root, '[data-layer-id="ti"]');
    expect(r.getAttribute("data-state")).toBe("out_of_range");
    const hint = must(r, '[data-slot="layer-range-hint"]');
    expect(hint.textContent).toMatch(/Zoom in to see this layer/);
    const value = must(hint, "[data-provenance][data-source]");
    expect(value.textContent).toContain("100");
  });

  it("a row with no native resolution shows the dash, flagged unavailable, never a number", async () => {
    const { root } = await panel([sci("ti", { visible: true, nativeResolutionM: undefined })]);
    const value = must(root, '[data-layer-id="ti"] [data-slot="layer-native"] [data-unavailable="true"]');
    expect(value.textContent).toBe("—");
  });
});
