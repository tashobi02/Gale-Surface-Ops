/** P7: serve the backend payloads through their actual frontend consumers (FR-15). */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { SourcesMethods } from "../../src/ui/screens/scr09SourcesMethods";
import { EarthView, earthLinkState } from "../../src/ui/screens/scr16EarthView";
import { EarthLinkWidget } from "../../src/ui/ops/EarthLinkWidget";
import { storeFromBeat } from "./fixtureStore";
import { installDom, removeDom, mount, must, flush } from "./domHarness";
import { mockLoadedSite } from "./map/mapFixtures";
const session = vi.hoisted(() => ({ snapshot: null as unknown }));
vi.mock("../../src/state/habSession", () => ({ useSnapshot: () => session.snapshot, useCommand: () => vi.fn() }));
beforeEach(installDom);
afterEach(() => { vi.unstubAllGlobals(); removeDom(); });

it.each(["AVAILABLE", "WAITING"] as const)("N-31 displays the supplied %s state with its own source", async state => {
  const base = storeFromBeat("connect").state()!;
  const earth = { ...base.earth, link_state: state, link_source_id: "snapshot:earth.link_state" };
  const view = await mount(createElement(EarthLinkWidget, { snapshot: { ...base, earth, provenance: { ...base.provenance, "earth.link_state": "derived" } } }));
  const cell = must(view.container, '[data-value="link-state"]');
  expect(cell.textContent).toContain(state);
  expect(cell.getAttribute("data-provenance")).toBe("derived");
  expect(cell.getAttribute("data-source")).toBe(earth.link_source_id);
  expect(cell.hasAttribute("data-unavailable")).toBe(false);
  expect(earthLinkState(earth)).toBe(state);
  await view.unmount();
});

it("N-30 loads the scenario's ParamSets and replay source without collapsing their classes", async () => {
  const param = JSON.parse(readFileSync(new URL("../../../../scenarios/storm-sol4190/param_sets/suit-assumed.json", import.meta.url), "utf8"));
  const dose = JSON.parse(readFileSync(new URL("../../../../scenarios/storm-sol4190/dose_series.json", import.meta.url), "utf8"));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ param_sets: [param], dose_series: { ...dose, title: "Solar particle event" } }) })));
  const view = await mount(createElement(SourcesMethods, { site: mockLoadedSite() }));
  await flush();
  expect(must(view.container, '[data-slot="param-entry"]').getAttribute("data-provenance")).toBe(param.provenance);
  expect(must(view.container, '[data-slot="replay-entry"]').getAttribute("data-provenance")).toBe("replayed");
  expect(must(view.container, '[data-slot="replay-entry"]').getAttribute("data-source")).toBe(dose.source_id);
  await view.unmount();
});

it("N-130 renders only the delayed crew and alerts, with the supplied as-of annotation", async () => {
  session.snapshot = storeFromBeat("connect").state();
  const payload = { as_of_utc: "2024-05-20T00:00:00Z", crew: [{ crew_id: "EV2", x_m: 10, y_m: 20, sample_utc: "2024-05-20T00:00:00Z" }], alerts: [{ alert_id: "delayed", code: "COMM_SHADOW", message: "Delayed warning", level: "caution", subjects: ["EV2"], raised_utc: "2024-05-20T00:00:00Z" }], provenance: { crew: "simulated", alerts: "simulated", as_of_utc: "derived" }, source_ids: { crew: "engine:trace", alerts: "engine:log", as_of_utc: "earth_link" } };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => payload })));
  const view = await mount(createElement(EarthView));
  await flush();
  const summary = must(view.container, '[aria-labelledby="earth-summary"]');
  expect(summary.textContent).toContain("Delayed warning");
  expect(summary.textContent).toContain("EV2");
  const stamp = must(summary, '[data-source="earth_link"]');
  expect(stamp.textContent).toContain(payload.as_of_utc);
  expect(stamp.getAttribute("data-provenance")).toBe("derived");
  expect(summary.querySelector('[data-source="engine:trace"]')?.getAttribute("data-provenance")).toBe("simulated");
  await view.unmount();
});
