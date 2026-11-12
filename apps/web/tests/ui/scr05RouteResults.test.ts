/**
 * SCR-05 Route Results panel (T09.03; docs/specs/03 SCR-05, 04 §D, §F; FR-07-FR-12, FR-15, NFR-05).
 * Originally by Saba Atharique (#179, static-markup tests only); the real component is now mounted in jsdom, driven
 * through the plan store and clicked.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { OkLeg, PlanResult, Warning } from "@marswalk/protocol";
import { RouteResults } from "../../src/ui/screens/scr05RouteResults";
import { PROVENANCE_GLYPHS } from "../../src/ui/components/provenance";
import { ProfileChart } from "../../src/ui/results/profileChart";
import { linkProfileToMap } from "../../src/ui/results/profileLink";
import { click, installDom, mount, must, removeDom } from "./domHarness";
import { fakeMapHandle } from "./fakeMapHandle";
import { fakePlanStore, resultOf, SCENARIO } from "./planStoreFake";
import okFixture from "../fixtures/plan-results/ok.json";
import partialFixture from "../fixtures/plan-results/partial.json";
import overLimitsFixture from "../fixtures/plan-results/over-limits.json";

// The chart (T09.02) and the profile link (T09.05) belong to other tasks and are stubs on main: replace them so this file
// tests the panel. A test that needs the real stub failing sets the implementation itself.
vi.mock("../../src/ui/results/profileChart", async (original) => ({ ...await original<typeof import("../../src/ui/results/profileChart")>(), ProfileChart: vi.fn() }));
vi.mock("../../src/ui/results/profileLink", () => ({ linkProfileToMap: vi.fn() }));

const ok = okFixture as unknown as PlanResult;
const partial = partialFixture as unknown as PlanResult;
const overLimits = overLimitsFixture as unknown as PlanResult;

beforeAll(() => installDom());
afterAll(() => removeDom());
beforeEach(() => {
  vi.mocked(ProfileChart).mockImplementation(() => createElement("div", { "data-testid": "profile-chart" }, "profile"));
  vi.mocked(linkProfileToMap).mockImplementation(() => () => {});
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.mocked(ProfileChart).mockReset();
  vi.mocked(linkProfileToMap).mockReset();
});

const ui = (props: Parameters<typeof RouteResults>[0]) => createElement(RouteResults, props);
const metric = (root: ParentNode, label: string): HTMLElement => {
  const tile = [...root.querySelectorAll<HTMLElement>(".scr05-metric")].find((t) => t.querySelector(".scr05-metric-label")?.textContent === label);
  if (!tile) throw new Error(`no metric tile "${label}"`);
  return tile;
};
const values = (tile: HTMLElement): HTMLElement[] => [...tile.querySelectorAll<HTMLElement>(".metric-value")];

describe("SCR-05 states (03 SCR-05; 04 §D status banner)", () => {
  it("Empty: 'No plan yet', 'Add at least one stop', and every metric is the no-data dash with a needs-a-plan hint", async () => {
    const { store } = fakePlanStore({ status: "Empty", result: null, waypoints: [{ id: "wp-0", role: "start", x_m: 0, y_m: 0 }] });
    const view = await mount(ui({ planStore: store }));
    expect(view.container.textContent).toContain("No plan yet");
    expect(view.container.textContent).toContain("Add at least one stop");
    for (const label of ["Distance", "Walk time", "EVA total", "Max slope", "Max walkback", "Dose"]) {
      const tile = metric(view.container, label);
      expect(tile.getAttribute("title")).toBe("Needs a plan");
      // The first value is plan-derived; a limit after it is the scenario's own input and stays.
      const v = values(tile)[0]!;
      expect(v.textContent).toBe("—");
      expect(v.getAttribute("data-unavailable")).toBe("true");
      expect(v.getAttribute("data-source")).toMatch(/^unavailable:result\./);
    }
    await view.unmount();
  });

  it("Computing: keeps the layout, dims the previous values to 50 % and says 'Computing…'", async () => {
    const { store } = fakePlanStore({ status: "Computing", result: ok });
    const view = await mount(ui({ planStore: store }));
    expect(view.container.textContent).toContain("Computing…");
    expect(must(view.container, ".scr05-results-panel").getAttribute("data-computing")).toBe("true");
    expect(must<HTMLElement>(view.container, ".scr05-metrics-row").style.opacity).toBe("0.5");
    expect(values(metric(view.container, "Distance"))[0]!.textContent).toBe("6.12");
    await view.unmount();
  });

  it("Partial: names the NO_ROUTE reason and hides every total (02 §E.2: no misleading totals)", async () => {
    const { store } = fakePlanStore({ status: "Partial", result: partial });
    const view = await mount(ui({ planStore: store }));
    expect(view.container.textContent).toContain("Partial");
    expect(view.container.textContent).toContain("DISCONNECTED_BY_SLOPE");
    expect(must(view.container, ".scr05-metrics-row").getAttribute("data-totals-hidden")).toBe("true");
    for (const label of ["Distance", "Walk time", "EVA total", "Max slope", "Max walkback", "Dose"]) {
      expect(values(metric(view.container, label))[0]!.textContent).toBe("—");
    }
    // The scenario's limits are inputs, not totals: they stay.
    expect(values(metric(view.container, "EVA total"))[1]!.textContent).toBe("360");
    expect(values(metric(view.container, "Max walkback"))[1]!.textContent).toBe("5.00");
    await view.unmount();
  });

  it("Over limits: says so and names the exceeded limit in words", async () => {
    const { store } = fakePlanStore({ status: "OverLimits", result: overLimits });
    const view = await mount(ui({ planStore: store }));
    const banner = must(view.container, ".scr05-banner-status").textContent ?? "";
    expect(banner).toContain("Over limits");
    expect(banner).toContain("Walkback exceeded");
    await view.unmount();
  });

  it("Error: 'Computation failed' with the error code, and Retry calls the store's retry", async () => {
    const fake = fakePlanStore({ status: "Error", last_error_code: "TIMEOUT", result: null });
    const view = await mount(ui({ planStore: fake.store }));
    expect(view.container.textContent).toContain("Computation failed");
    expect(view.container.textContent).toContain("TIMEOUT");
    await click(must(view.container, ".scr05-retry-btn"));
    expect(fake.retry).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("OK: says OK, with every leg routed and within limits", async () => {
    const { store } = fakePlanStore({ status: "OK", result: ok });
    const view = await mount(ui({ planStore: store }));
    const strip = must(view.container, ".scr05-banner-status");
    expect(strip.textContent).toContain("OK");
    expect(strip.querySelector(".status-nominal")).not.toBeNull();
    await view.unmount();
  });

  it("follows the plan store: a new result replaces the values, and the panel unsubscribes on unmount", async () => {
    const fake = fakePlanStore({ status: "Empty", result: null });
    const view = await mount(ui({ planStore: fake.store }));
    expect(values(metric(view.container, "Distance"))[0]!.textContent).toBe("—");
    await act(async () => fake.emit({ status: "OK", result: ok }));
    expect(values(metric(view.container, "Distance"))[0]!.textContent).toBe("6.12");
    expect(fake.listenerCount()).toBeGreaterThan(0);
    await view.unmount();
    expect(fake.listenerCount()).toBe(0);
  });
});

describe("SCR-05 metrics: value, unit, provenance class and real source ids (FR-15, NFR-05; 05 §F.3)", () => {
  async function okTiles() {
    const { store } = fakePlanStore({ status: "OK", result: ok });
    return mount(ui({ planStore: store }));
  }

  it("shows the six headline values with units", async () => {
    const view = await okTiles();
    const text = (label: string) => metric(view.container, label).textContent ?? "";
    expect(text("Distance")).toContain("6.12");
    expect(text("Distance")).toContain("km");
    expect(text("Walk time")).toContain("128");
    expect(text("Walk time")).toContain("min");
    expect(text("EVA total")).toContain("148");
    expect(text("Max slope")).toContain("12.6");
    expect(text("Max slope")).toContain("°");
    expect(text("Max walkback")).toContain("3.06");
    expect(text("Dose")).toContain("0.07"); // mSv at two decimals (FD-124), not the raw 0.066
    expect(text("Dose")).toContain("mSv");
    await view.unmount();
  });

  it("builds every tile from the shared Metric component (FD-058): its classes, units with a thin space, no unit beside a dash", async () => {
    const view = await okTiles();
    const tile = metric(view.container, "Distance");
    expect(tile.querySelector(".metric")).not.toBeNull();
    expect(tile.querySelector(".metric-unit")?.textContent).toBe("\u2009km");
    expect(view.container.querySelector(".scr05-metric-value")).toBeNull();
    await view.unmount();
    const empty = await mount(ui({ planStore: fakePlanStore({ status: "Empty", result: null }).store }));
    expect(metric(empty.container, "Distance").querySelector(".metric-unit")).toBeNull();
    await empty.unmount();
  });

  it("labels walk time as modelled with the Tobler and Apollo sources, and dose as modelled from the RAD source", async () => {
    const view = await okTiles();
    const walk = values(metric(view.container, "Walk time"))[0]!;
    expect(walk.getAttribute("data-provenance")).toBe("modelled");
    expect(walk.getAttribute("data-source")).toContain("tobler-1993");
    expect(walk.getAttribute("data-source")).toContain("apollo17-planning");
    const dose = values(metric(view.container, "Dose"))[0]!;
    expect(dose.getAttribute("data-provenance")).toBe("modelled");
    expect(dose.getAttribute("data-source")).toBe("hassler-2014-rad");
    await view.unmount();
  });

  it("labels the max walkback derived, and distance and max slope derived from the DEM source", async () => {
    const view = await okTiles();
    const walkback = values(metric(view.container, "Max walkback"))[0]!;
    expect(walkback.getAttribute("data-provenance")).toBe("derived");
    expect(walkback.getAttribute("data-source")).toBeTruthy();
    for (const label of ["Distance", "Max slope"]) {
      const v = values(metric(view.container, label))[0]!;
      expect(v.getAttribute("data-provenance")).toBe("derived");
      expect(v.getAttribute("data-source")).toBe("usgs-gale-dem-1m-v3");
    }
    await view.unmount();
  });

  it("shows the limits from the scenario, labelled assumed with the scenario field as source", async () => {
    const view = await okTiles();
    const [total, limit] = values(metric(view.container, "EVA total"));
    expect(total!.textContent).toBe("148");
    expect(limit!.textContent).toBe("360");
    expect(limit!.getAttribute("data-provenance")).toBe("assumed");
    expect(limit!.getAttribute("data-source")).toBe("scenario.max_eva_duration_h");
    const [, wbLimit] = values(metric(view.container, "Max walkback"));
    expect(wbLimit!.textContent).toBe("5.00"); // km at two decimals (FD-124)
    expect(wbLimit!.getAttribute("data-provenance")).toBe("assumed");
    expect(wbLimit!.getAttribute("data-source")).toBe("scenario.walkback_limit_km");
    await view.unmount();
  });

  it("invents no limit: a scenario without the field shows the dash, never 360 min or 3.6 km", async () => {
    const { max_eva_duration_h: _a, walkback_limit_km: _b, ...partialScenario } = SCENARIO;
    const { store } = fakePlanStore({ status: "OK", result: ok, scenario: partialScenario as unknown as typeof SCENARIO });
    const view = await mount(ui({ planStore: store }));
    const [, evaLimit] = values(metric(view.container, "EVA total"));
    const [, wbLimit] = values(metric(view.container, "Max walkback"));
    for (const v of [evaLimit!, wbLimit!]) {
      expect(v.textContent).toBe("—");
      expect(v.getAttribute("data-unavailable")).toBe("true");
      expect(v.getAttribute("data-provenance")).toBe("assumed");
      expect(v.getAttribute("data-source")).toMatch(/^unavailable:scenario\./);
    }
    expect(view.container.textContent).not.toContain("360");
    expect(view.container.textContent).not.toContain("3.6");
    await view.unmount();
  });

  it("shows the dash for a dose the result does not carry (radiation is optional in the M3 slice)", async () => {
    const { radiation: _r, ...withoutRadiation } = ok;
    const { store } = fakePlanStore({ status: "OK", result: withoutRadiation as PlanResult });
    const view = await mount(ui({ planStore: store }));
    const dose = values(metric(view.container, "Dose"))[0]!;
    expect(dose.textContent).toBe("—");
    expect(dose.getAttribute("data-unavailable")).toBe("true");
    await view.unmount();
  });

  it("draws provenance chips from the glyph table with the full class word, never an abbreviation", async () => {
    const view = await okTiles();
    const chips = [...view.container.querySelectorAll<HTMLElement>(".metric-chip")];
    expect(chips.length).toBeGreaterThanOrEqual(6);
    for (const chip of chips) {
      const prov = chip.getAttribute("data-provenance") as keyof typeof PROVENANCE_GLYPHS;
      expect(chip.textContent).toBe(`${PROVENANCE_GLYPHS[prov]} ${prov.toUpperCase()}`);
      expect(chip.getAttribute("data-source")).toBeTruthy();
    }
    expect(chips.map((c) => c.textContent)).not.toContain("ASS");
    expect(view.container.querySelector("[data-source-id]")).toBeNull();
    await view.unmount();
  });
});

describe("SCR-05 announcements and collapsing (04 §E, §B)", () => {
  it("announces the status in a polite live region", async () => {
    const { store } = fakePlanStore({ status: "OverLimits", result: overLimits });
    const view = await mount(ui({ planStore: store }));
    const live = must(view.container, "[aria-live]");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("Plan updated: Over limits, 2 warnings");
    await view.unmount();
  });

  it("collapses to the 48 px status strip: the banner stays, the body goes, and it comes back", async () => {
    const { store } = fakePlanStore({ status: "OK", result: ok });
    const view = await mount(ui({ planStore: store }));
    expect(view.container.querySelector(".scr05-body")).not.toBeNull();
    const toggle = must<HTMLButtonElement>(view.container, ".scr05-collapse-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await click(toggle);
    expect(view.container.querySelector(".scr05-body")).toBeNull();
    expect(must(view.container, ".scr05-results-panel").getAttribute("data-collapsed")).toBe("true");
    expect(view.container.textContent).toContain("OK");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(toggle);
    expect(view.container.querySelector(".scr05-body")).not.toBeNull();
    await view.unmount();
  });

  it("shows a per-leg Details table on request, with a stable row per leg and a labelled value in each cell", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { store } = fakePlanStore({ status: "Partial", result: partial });
    const view = await mount(ui({ planStore: store }));
    expect(view.container.querySelector("table")).toBeNull();
    const details = must<HTMLButtonElement>(view.container, ".scr05-details-toggle");
    await click(details);
    expect(details.getAttribute("aria-expanded")).toBe("true");
    const rows = [...view.container.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("wp-0");
    expect(rows[0]!.querySelector("[data-provenance=derived]")).not.toBeNull();
    expect(rows[1]!.textContent).toContain("NO ROUTE");
    expect([...rows[1]!.querySelectorAll("[data-unavailable=true]")].length).toBeGreaterThan(0);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/unique "key"/);
    await view.unmount();
  });
});

describe("SCR-05 mounts the chart, warnings and profile link, each isolated (03 SCR-05; T09.03 step 6)", () => {
  it("keeps the banner, metrics and warnings when the profile chart throws, and says the chart is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(ProfileChart).mockImplementation(() => {
      throw new Error("Chart failed");
    });
    const { store } = fakePlanStore({ status: "OverLimits", result: overLimits });
    const view = await mount(ui({ planStore: store }));
    expect(view.container.textContent).toContain("Profile unavailable");
    expect(view.container.textContent).toContain("Chart failed");
    expect(view.container.textContent).toContain("Over limits");
    expect(values(metric(view.container, "Distance"))[0]!.textContent).toBe("6.12");
    expect(view.container.querySelectorAll(".warnings-list li")).toHaveLength(2);
    await view.unmount();
  });

  it("links the profile to the map through the handle and unlinks on unmount", async () => {
    const unlink = vi.fn();
    vi.mocked(linkProfileToMap).mockImplementation(() => unlink);
    const { handle } = fakeMapHandle();
    const { store } = fakePlanStore({ status: "OK", result: ok });
    const view = await mount(ui({ planStore: store, mapHandle: handle }));
    expect(linkProfileToMap).toHaveBeenCalledTimes(1);
    const [calledHandle, element] = vi.mocked(linkProfileToMap).mock.calls[0]!;
    expect(calledHandle).toBe(handle);
    expect(element).toBe(must(view.container, ".scr05-profile-container"));
    expect(unlink).not.toHaveBeenCalled();
    await view.unmount();
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it("unlinks and relinks when the map handle changes, and does not link without a handle or a result", async () => {
    const unlink = vi.fn();
    vi.mocked(linkProfileToMap).mockImplementation(() => unlink);
    const first = fakeMapHandle().handle;
    const second = fakeMapHandle().handle;
    const { store } = fakePlanStore({ status: "OK", result: ok });
    const view = await mount(ui({ planStore: store, mapHandle: first }));
    await view.rerender(ui({ planStore: store, mapHandle: second }));
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(linkProfileToMap).toHaveBeenCalledTimes(2);
    expect(vi.mocked(linkProfileToMap).mock.calls[1]![0]).toBe(second);
    await view.unmount();

    vi.mocked(linkProfileToMap).mockClear();
    const none = await mount(ui({ planStore: store }));
    expect(linkProfileToMap).not.toHaveBeenCalled();
    await none.unmount();
    const empty = fakePlanStore({ status: "Empty", result: null });
    const noResult = await mount(ui({ planStore: empty.store, mapHandle: first }));
    expect(linkProfileToMap).not.toHaveBeenCalled();
    await noResult.unmount();
  });

  it("reports a link failure in the panel instead of swallowing it, and the rest stays usable", async () => {
    vi.mocked(linkProfileToMap).mockImplementation(() => {
      throw new Error("Link failed");
    });
    const { handle } = fakeMapHandle();
    const { store } = fakePlanStore({ status: "OK", result: ok });
    const view = await mount(ui({ planStore: store, mapHandle: handle }));
    const note = must(view.container, ".scr05-link-note");
    expect(note.textContent).toContain("Profile ↔ map link unavailable");
    expect(note.textContent).toContain("Link failed");
    expect(values(metric(view.container, "Distance"))[0]!.textContent).toBe("6.12");
    await view.unmount();
  });

  it("zooms the map to a located warning's stretch: Zoom fits the extent from the leg's geometry", async () => {
    const leg: OkLeg = {
      ...(ok.legs[0] as OkLeg),
      geometry: [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
    };
    const warning: Warning = { code: "CAUTION_SLOPE", severity: "caution", leg: 0, from_m: 50, to_m: 150, message: "Slope above caution" };
    const { handle, fitted } = fakeMapHandle();
    const { store } = fakePlanStore({ status: "OK", result: resultOf({ legs: [leg], totals: ok.totals, warnings: [warning] }) });
    const view = await mount(ui({ planStore: store, mapHandle: handle }));
    await click(must(view.container, ".warning-zoom-btn"));
    expect(fitted).toEqual([[50, 0, 100, 50]]);
    await view.unmount();
  });
});

it("seven metrics include sourced climb/descent and modelled EVA total", async () => {
  const { store } = fakePlanStore({ status: "OK", result: ok });
  const view = await mount(ui({ planStore: store }));
  expect(view.container.querySelectorAll(".scr05-metric")).toHaveLength(7);
  expect(metric(view.container, "Climb / descent").textContent).toContain("74");
  expect(values(metric(view.container, "EVA total"))[0]!.getAttribute("data-provenance")).toBe("modelled");
  await view.unmount();
});
it("missing haven and comm bands show sourced dashes with reasons", async () => {
  const { store } = fakePlanStore({ status: "OK", result: ok });
  const view = await mount(ui({ planStore: store }));
  for (const band of ["haven", "comm"]) {
    const row = must(view.container, `[data-band="${band}"]`);
    expect(row.textContent).toContain("—");
    expect(row.textContent).toMatch(/not supplied/i);
    expect(row.querySelector("[data-source]")).not.toBeNull();
  }
  await view.unmount();
});
it("haven and comm bands render worker samples without computing them", async () => {
  const leg = { ...ok.legs[0], profile: { dist_m: [0, 5, 10], elev_m: [0, 0, 0], slope_class: ["ok", "ok", "ok"], haven_min: [1, 2, 2], comm: [1, 0, 0] } } as OkLeg;
  const { store } = fakePlanStore({ status: "OK", result: { ...ok, legs: [leg] } });
  const view = await mount(ui({ planStore: store }));
  expect(must(view.container, '[data-band="haven"]').textContent).toContain("modelled (approximation)");
  expect(must(view.container, '[data-band="comm"]').textContent).toContain("NO SIGNAL");
  await view.unmount();
});
