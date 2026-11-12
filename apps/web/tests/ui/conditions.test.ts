import { afterAll, beforeAll, expect, it } from "vitest";
import { createElement } from "react";
import type { PlanResult } from "@marswalk/protocol";
import type { AppContext } from "../../src/ui/context";
import { Conditions } from "../../src/ui/screens/scr07Conditions";
import { installDom, mount, must, removeDom } from "./domHarness";
import { fakePlanStore, SCENARIO } from "./planStoreFake";
import { mockLoadedSite } from "./map/mapFixtures";
import okFixture from "../fixtures/plan-results/ok.json";
import overFixture from "../fixtures/plan-results/over-limits.json";
beforeAll(installDom);
afterAll(removeDom);
const ctxFor = (result: PlanResult) => ({ site: mockLoadedSite(), planStore: fakePlanStore({ scenario: { ...SCENARIO, loop: true }, status: result.status === "PARTIAL" ? "Partial" : "OK", result }).store }) as AppContext;
it("daylight warning for pre-dawn", async () => {
  const view = await mount(createElement(Conditions, { ctx: ctxFor({ ...overFixture, warnings: [{ code: "DARKNESS", severity: "blocked", leg: null, from_m: null, to_m: null, at_utc: "2026-11-14T04:00:00Z", message: "Start in darkness; change the start time" }] } as unknown as PlanResult) }));
  const alert = must(view.container, '[role="alert"]');
  expect(alert.textContent).toContain("Daylight warning");
  expect(alert.textContent).toMatch(/dark|horizon/i);
  expect(alert.querySelector(".status-glyph")).not.toBeNull();
  expect(alert.textContent).toContain("UTC");
  await view.unmount();
});
it("fields absent show dash", async () => {
  const view = await mount(createElement(Conditions, { ctx: ctxFor(okFixture as unknown as PlanResult) }));
  for (const field of ["mars-year", "ls", "ltst-start", "ltst-return", "sunrise", "sunset"]) {
    const el = must(view.container, `[data-condition="${field}"]`);
    expect(el.textContent).toContain("—");
    expect(el.querySelector('[data-source^="unavailable:"]')).not.toBeNull();
  }
  expect(view.container.querySelector('[data-condition="sol"]')).toBeNull();
  expect(view.container.textContent).toMatch(/not included in this build/i);
  await view.unmount();
});
it("radiation label text", async () => {
  const view = await mount(createElement(Conditions, { ctx: ctxFor(okFixture as unknown as PlanResult) }));
  expect(view.container.textContent).toContain("measured background rate × planned duration (simplified)");
  expect(view.container.textContent).toContain("solar energetic particle events, suit/habitat shielding, terrain sky-blocking, altitude differences within AOI");
  const radiation = must(view.container, '[data-condition="radiation"]');
  expect(radiation.textContent).toContain("0.07");
  expect(radiation.textContent).toContain("0.05");
  expect(radiation.textContent).toContain("0.08");
  expect(radiation.querySelector('[data-source="hassler-2014-rad"]')).not.toBeNull();
  await view.unmount();
});
it("supplied Mars24 fields are modelled and the last arrival is labelled at return", async () => {
  const result = { ...okFixture, conditions: { mars_year: 38, ls_deg: 45, sol: 4190, sunrise_ltst: "06:00", sunset_ltst: "18:00", sunrise_utc: "2026-11-14T06:00:00Z", sunset_utc: "2026-11-14T18:00:00Z" }, stops_timeline: [ { arrive_utc: "2026-11-14T08:00:00Z", depart_utc: "2026-11-14T08:00:00Z", arrive_ltst: "08:00", sun_elevation_deg: 10 }, { arrive_utc: "2026-11-14T09:00:00Z", depart_utc: "2026-11-14T09:00:00Z", arrive_ltst: "09:00", sun_elevation_deg: 20 } ] } as unknown as PlanResult;
  const view = await mount(createElement(Conditions, { ctx: ctxFor(result) }));
  expect(must(view.container, '[data-condition="ltst-return"]').textContent).toContain("at return");
  expect(must(view.container, '[data-condition="ltst-return"]').textContent).toContain("09:00");
  expect(must(view.container, '[data-condition="sol"]').textContent).toContain("4190");
  expect(view.container.querySelectorAll('[data-source="mars24-allison-mcewen-2000"][data-provenance="modelled"]').length).toBeGreaterThan(3);
  await view.unmount();
});
it("one-way plans still show the final supplied arrival per FD-127", async () => {
  const result = { ...okFixture, stops_timeline: [{ arrive_utc: "2026-11-14T09:00:00Z", depart_utc: "2026-11-14T09:00:00Z", arrive_ltst: "09:00", sun_elevation_deg: 20 }] } as unknown as PlanResult;
  const ctx = ctxFor(result);
  ctx.planStore = fakePlanStore({ scenario: { ...SCENARIO, loop: false }, result }).store;
  const view = await mount(createElement(Conditions, { ctx }));
  expect(must(view.container, '[data-condition="ltst-return"]').textContent).toContain("09:00");
  await view.unmount();
});
it("failed recomputation shows sourced unknown fields instead of the previous dose", async () => {
  const ctx = ctxFor(okFixture as unknown as PlanResult);
  ctx.planStore = fakePlanStore({ status: "Error", result: okFixture as unknown as PlanResult, last_error_code: "INTERNAL" }).store;
  const view = await mount(createElement(Conditions, { ctx }));
  expect(must(view.container, '[data-condition="radiation"] .metric-value').textContent).toBe("—");
  expect(view.container.textContent).toContain("INTERNAL");
  expect(view.container.querySelector(".status-unknown")).not.toBeNull();
  await view.unmount();
});
