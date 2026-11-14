/** T26.05 / FR-43: Earth values come only from the snapshot. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { EarthLinkWidget } from "../../src/ui/ops/EarthLinkWidget";
import { storeFromBeat } from "./fixtureStore";
import { installDom, mount, must, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
describe("Earth link widget", () => {
  it("values labelled", async () => {
    const client = storeFromBeat("connect", "ops");
    const base = client.state()!;
    const snapshot = { ...base, earth: { ...base.earth, light_time_s: 754.4 } };
    const view = await mount(createElement(EarthLinkWidget, { snapshot }));
    const light = must(view.container, '[data-value="light-time"]');
    expect(light.textContent).toBe("12:34");
    expect(light.getAttribute("data-provenance")).toBe("derived");
    expect(light.getAttribute("data-source")).toBe("snapshot:earth.light_time_s");
    const toEarth = must(view.container, '[data-value="queue-to-earth"]');
    expect(toEarth.textContent).toContain("0");
    expect(toEarth.getAttribute("data-provenance")).toBe("simulated");
    for (const value of view.container.querySelectorAll('[data-value]')) expect(value.getAttribute("data-source")).toBeTruthy();
    expect(must(view.container, '[data-value="next-pass"]').getAttribute("data-unavailable")).toBe("true");
    // FD-286: the reducer's 0 s fallback (no Earth-link table row) is not a light time.
    await view.rerender(createElement(EarthLinkWidget, { snapshot: base }));
    expect(must(view.container, '[data-value="light-time"]').textContent).toBe("—");
    expect(must(view.container, '[data-value="light-time"]').getAttribute("data-unavailable")).toBe("true");
    // The class comes from the snapshot's own provenance map when it names one.
    await view.rerender(createElement(EarthLinkWidget, { snapshot: { ...snapshot, provenance: { ...snapshot.provenance, "earth.light_time_s": "replayed" } } }));
    expect(must(view.container, '[data-value="light-time"]').getAttribute("data-provenance")).toBe("replayed");
    await view.rerender(createElement(EarthLinkWidget, { snapshot: null }));
    for (const value of view.container.querySelectorAll('[data-value]')) {
      expect(value.textContent).toBe("—");
      expect(value.getAttribute("data-unavailable")).toBe("true");
    }
    await view.unmount();
    client.close();
  });

  it("renders supplied link states with their provenance and source", async () => {
    const client = storeFromBeat("connect", "ops");
    const base = client.state()!;
    const view = await mount(createElement(EarthLinkWidget, { snapshot: { ...base, provenance: { ...base.provenance, "earth.link_state": "derived" }, earth: { ...base.earth, link_state: "AVAILABLE", link_source_id: "engine:link" } } }));
    const state = must(view.container, '[data-value="link-state"]');
    expect(state.textContent).toContain("AVAILABLE");
    expect(state.getAttribute("data-provenance")).toBe("derived");
    expect(state.getAttribute("data-source")).toBe("engine:link");
    await view.rerender(createElement(EarthLinkWidget, { snapshot: { ...base, earth: { ...base.earth, link_state: "WAITING" } } }));
    expect(state.textContent).toContain("WAITING");
    await view.unmount();
    client.close();
  });

  it("conjunction state", async () => {
    const client = storeFromBeat("connect", "ops");
    const snapshot = client.state()!;
    const view = await mount(createElement(EarthLinkWidget, { snapshot: { ...snapshot, earth: { ...snapshot.earth, blackout: true } } }));
    const state = must(view.container, '[data-value="link-state"]');
    expect(state.textContent).toContain("CONJUNCTION");
    expect(state.textContent).toContain("▲");
    expect(state.getAttribute("data-provenance")).toBe("derived");
    expect(state.getAttribute("data-source")).toBe("snapshot:earth.blackout");
    await view.rerender(createElement(EarthLinkWidget, { snapshot }));
    expect(must(view.container, '[data-value="link-state"]').textContent).toBe("—");
    await view.unmount();
    client.close();
  });
});
