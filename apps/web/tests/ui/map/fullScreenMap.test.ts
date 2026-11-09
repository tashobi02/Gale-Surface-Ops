/**
 * T24.10 / T24.09 — Full-screen map tests (docs/specs/01 FR-32; 04 §E.5; mockup handoff DV-13, G-42, G-48).
 * The real FullScreenMap component is mounted and its controls are clicked.
 *
 * Not claimed here: pixel geometry (the map taking >= 80 % of the width) and the shared Mars map instance. Those
 * need a browser and the T07.17 MapControls integration.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { FullScreenMap, MAX_SCIENCE_LAYERS, type FullScreenMapLayer } from "../../../src/ui/map/FullScreenMap";
import { click, installDom, mount, must, removeDom } from "../domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  document.body.innerHTML = "";
});

describe("MapControls (04 §E.5)", () => {
  // TODO(decision): coordinate Mars map rendering, shared MapControls and tablet full-map composition with
  // T07.06/T07.17/T24.09 owners; preserve #104's component until that integration.
  it.todo("renders MapControls without throwing (pending T07.17 implementation)");
  it.todo("ops and planner show + / − / FIT only (T07.17)");
  it.todo("every action works without drag, wheel or pinch (T07.17)");
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
