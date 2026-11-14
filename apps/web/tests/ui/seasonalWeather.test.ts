/**
 * T18.03 (N-24): SCR-07's seasonal-weather section shows the REMS L_s-bin context when the build carries one,
 * and keeps "Not included in this build" when it does not (01 FR-13, 03 SCR-07).
 *
 * The client never computes the context: it reads the pipeline's `rems_context.json` from the site bundle and
 * looks up the bin for the plan's L_s. Each value carries its own provenance class and source id (FR-15, NFR-05).
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { createElement } from "react";
import type { PlanResult } from "@marswalk/protocol";
import type { AppContext } from "../../src/ui/context";
import { Conditions } from "../../src/ui/screens/scr07Conditions";
import { isRemsContext, selectRemsBin, type RemsContext } from "../../src/ui/screens/remsContext";
import { installDom, mount, must, removeDom } from "./domHarness";
import { fakePlanStore, SCENARIO } from "./planStoreFake";
import { mockLoadedSite } from "./map/mapFixtures";
import okFixture from "../fixtures/plan-results/ok.json";

beforeAll(installDom);
afterAll(removeDom);

const REMS_SOURCE = "pds-atmos-msl-rems";

/** A context with one 255-260 deg bin, as the pipeline writes it. */
const CONTEXT: RemsContext = {
  ls_bin_width_deg: 5,
  provenance: "measured",
  source_id: REMS_SOURCE,
  source_files: ["RME_769411240RNV41900000000_______P1.TAB"],
  bins: [
    {
      ls_bin_start_deg: 255,
      ls_bin_end_deg: 260,
      provenance: "measured",
      source_id: REMS_SOURCE,
      sols: [4190],
      source_files: ["RME_769411240RNV41900000000_______P1.TAB"],
      air_temp_k: { unit: "K", provenance: "measured", source_id: REMS_SOURCE, count: 10, min: 202, p10: 208, median: 225, p90: 268, max: 275, source_files: ["RME_769411240RNV41900000000_______P1.TAB"] },
      ground_temp_k: { unit: "K", provenance: "measured", source_id: REMS_SOURCE, count: 10, min: 103, p10: 200, median: 220, p90: 275, max: 283, source_files: ["RME_769411240RNV41900000000_______P1.TAB"] },
      pressure_pa: { unit: "Pa", provenance: "measured", source_id: REMS_SOURCE, count: 10, min: 796, p10: 809, median: 870, p90: 886, max: 897, source_files: ["RME_769411240RNV41900000000_______P1.TAB"] },
    },
  ],
};

it("selectRemsBin picks the bin that contains L_s", () => {
  expect(selectRemsBin(CONTEXT, 257)?.ls_bin_start_deg).toBe(255);
  expect(selectRemsBin(CONTEXT, 255)?.ls_bin_start_deg).toBe(255);
  expect(selectRemsBin(CONTEXT, 259.999)?.ls_bin_start_deg).toBe(255);
});

it("selectRemsBin excludes the upper bound: a bin covers [start, end)", () => {
  const next = { ...CONTEXT.bins[0]!, ls_bin_start_deg: 260, ls_bin_end_deg: 265 };
  const twoBins: RemsContext = { ...CONTEXT, bins: [CONTEXT.bins[0]!, next] };
  expect(selectRemsBin(twoBins, 260)?.ls_bin_start_deg).toBe(260);
  expect(selectRemsBin(twoBins, 259.999)?.ls_bin_start_deg).toBe(255);
});

it("selectRemsBin returns null outside every bin and for a missing context", () => {
  expect(selectRemsBin(CONTEXT, 100)).toBeNull();
  expect(selectRemsBin(CONTEXT, 300)).toBeNull();
  expect(selectRemsBin(CONTEXT, 260)).toBeNull();
  expect(selectRemsBin(null, 257)).toBeNull();
  expect(selectRemsBin(CONTEXT, Number.NaN)).toBeNull();
});

it("rejects a context whose displayed bin lacks its source files or sols", () => {
  const bin = CONTEXT.bins[0]!;
  expect(isRemsContext({ ...CONTEXT, bins: [{ ...bin, source_files: [] }] })).toBe(false);
  expect(isRemsContext({ ...CONTEXT, bins: [{ ...bin, sols: null }] })).toBe(false);
});

it("preserves provenance separately for each supplied series", async () => {
  const bin = CONTEXT.bins[0]!;
  const context: RemsContext = { ...CONTEXT, bins: [{ ...bin, pressure_pa: { ...bin.pressure_pa, provenance: "derived", source_id: "pressure-source" } }] };
  const result = { ...okFixture, conditions: { ls_deg: 257 } } as unknown as PlanResult;
  const view = await mount(createElement(Conditions, { ctx: ctxFor(result), remsContext: context }));
  const values = [...must(view.container, '[data-condition="seasonal-weather"]').querySelectorAll('.metric-value')];
  expect(values.map(value => value.getAttribute("data-provenance"))).toEqual(["measured", "measured", "measured", "measured", "measured", "measured", "derived", "derived", "derived"]);
  expect(values[8]?.getAttribute("data-source")).toBe("pressure-source");
  await view.unmount();
});

it("SCR-07 keeps 'Not included in this build' when no REMS context is supplied", async () => {
  const view = await mount(createElement(Conditions, { ctx: ctxFor(okFixture as unknown as PlanResult) }));
  const section = must(view.container, '[data-condition="seasonal-weather"]');
  expect(section.textContent).toMatch(/not included in this build/i);
  expect(section.querySelector('[data-unavailable="true"]')).not.toBeNull();
  await view.unmount();
});

it("SCR-07 shows the REMS ranges for the plan's L_s bin, each with its own provenance and source", async () => {
  // The fixture carries no `conditions` of its own, so the plan's L_s is set here: the REMS panel reads it from there.
  const result = { ...okFixture, conditions: { ls_deg: 257 } } as unknown as PlanResult;
  const view = await mount(createElement(Conditions, { ctx: ctxFor(result), remsContext: CONTEXT }));
  const section = must(view.container, '[data-condition="seasonal-weather"]');
  expect(section.textContent).not.toMatch(/not included in this build/i);
  expect(section.querySelector('[data-unavailable="true"]')).toBeNull();
  expect(section.textContent).toContain("Air temperature");
  expect(section.textContent).toContain("Ground temperature");
  expect(section.textContent).toContain("Pressure");
  expect(section.textContent).toContain("255–260");
  expect(section.textContent).toContain("RME_769411240RNV41900000000_______P1.TAB");
  expect(section.textContent).toMatch(/sampled sols.*not.*complete climatology/i);
  expect(section.textContent).toMatch(/tenth, median and ninetieth percentiles/i);
  expect(must(section, '[data-rems-bin]').getAttribute("data-source")).toBe(REMS_SOURCE);
  expect(must(section, '[data-rems-sols]').getAttribute("data-provenance")).toBe("measured");
  // Nine values (three series of p10/median/p90); the Metric component repeats the class on the chip.
  const values = [...section.querySelectorAll(".metric-value")];
  expect(values).toHaveLength(9);
  for (const value of values) {
    expect(value.getAttribute("data-provenance")).toBe("measured");
    expect(value.getAttribute("data-source")).toBe("pds-atmos-msl-rems");
    expect(value.textContent).not.toBe("—");
  }
  await view.unmount();
});

it("SCR-07 keeps 'Not included in this build' when the context has no bin for the plan's L_s", async () => {
  const result = { ...okFixture, conditions: { ls_deg: 12 } } as unknown as PlanResult;
  const view = await mount(createElement(Conditions, { ctx: ctxFor(result), remsContext: CONTEXT }));
  const section = must(view.container, '[data-condition="seasonal-weather"]');
  expect(section.textContent).toMatch(/not included in this build/i);
  expect(section.textContent).toMatch(/no data for the plan's season/i);
  expect(must(section, '[data-unavailable="true"]').getAttribute("data-source")).toBe("unavailable:rems_context.bins");
  await view.unmount();
});

function ctxFor(result: PlanResult): AppContext {
  return { site: mockLoadedSite(), planStore: fakePlanStore({ scenario: { ...SCENARIO, loop: true }, status: "OK", result }).store } as AppContext;
}
